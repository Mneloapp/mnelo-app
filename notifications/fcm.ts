import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import type { PushProvider, PushResult, PushDeliveryOptions } from './apns';
import type { PushRegistration, WakeEvent } from '../src/messenger/wake-protocol';
const serviceAccount = z.object({
  type: z.literal('service_account'),
  project_id: z.string().regex(/^[a-z][a-z0-9-]{4,62}$/),
  client_email: z.string().email(),
  private_key: z.string().min(100),
});
// Direct FCM HTTP v1 provider. No paid intermediary and no content queue.
export class FirebasePushProvider implements PushProvider {
  private account: z.infer<typeof serviceAccount>;
  private access: { token: string; expires: number } | undefined;
  constructor(
    input: unknown,
    private readonly request: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {
    this.account = serviceAccount.parse(input);
    const key = createPrivateKey(this.account.private_key);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('PUSH_CONFIGURATION_INVALID');
  }
  private async post(url: string, body: string, headers: Record<string, string>) {
    const response = await this.request(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const size = Number(response.headers.get('content-length') ?? 0);
    if (size > 8192) throw new Error('PUSH_UNAVAILABLE');
    const reader = response.body?.getReader();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        text += decoder.decode(next.value, { stream: true });
        if (text.length > 8192) {
          await reader.cancel();
          throw new Error('PUSH_UNAVAILABLE');
        }
      }
    }
    return { status: response.status, body: text };
  }
  private async bearer() {
    if (this.access && this.access.expires > this.now()) return this.access.token;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const seconds = Math.floor(this.now() / 1000);
    const unsigned =
      encode({ alg: 'RS256', typ: 'JWT' }) +
      '.' +
      encode({
        iss: this.account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: seconds,
        exp: seconds + 3600,
      });
    const assertion =
      unsigned +
      '.' +
      sign('RSA-SHA256', Buffer.from(unsigned), this.account.private_key).toString('base64url');
    const result = await this.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      { 'Content-Type': 'application/x-www-form-urlencoded' },
    );
    if (result.status !== 200) throw new Error('PUSH_UNAVAILABLE');
    const data = z
      .object({
        access_token: z.string().min(10).max(4096),
        expires_in: z.number().int().min(60).max(3600),
      })
      .parse(JSON.parse(result.body));
    this.access = { token: data.access_token, expires: this.now() + (data.expires_in - 60) * 1000 };
    return data.access_token;
  }
  async send(
    registration: PushRegistration,
    event: WakeEvent,
    options?: PushDeliveryOptions,
  ): Promise<PushResult> {
    const attemptedAt = this.now();
    if (registration.platform !== 'android' || registration.environment !== 'production')
      throw new Error('PUSH_CHANNEL_INVALID');
    if ((registration.channel === 'voip') !== (event.kind === 'call'))
      throw new Error('PUSH_CHANNEL_INVALID');
    const body = {
      message: {
        token: registration.token,
        data: {
          mnelo: JSON.stringify({
            v: 1,
            ...event,
            ...(event.kind === 'call'
              ? { expires: Math.min(this.now() + 60000, options?.expiresAt ?? Infinity) }
              : {}),
            ...(options?.missedCall ? { reason: 'missed-call' } : {}),
          }),
        },
        android: {
          priority: 'HIGH',
          ttl:
            event.kind === 'call' || !options
              ? '0s'
              : Math.max(
                  0,
                  Math.min(2419200, Math.floor((options.expiresAt - this.now()) / 1000)),
                ) + 's',
          restricted_package_name: 'com.mnelo.messenger',
        },
      },
    };
    const result = await this.post(
      'https://fcm.googleapis.com/v1/projects/' + this.account.project_id + '/messages:send',
      JSON.stringify(body),
      { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await this.bearer()) },
    );
    if (result.status === 200) return { accepted: true };
    if (result.status === 404) {
      const data = z
        .object({
          error: z.object({
            details: z
              .array(z.object({ errorCode: z.string().optional() }).passthrough())
              .optional(),
          }),
        })
        .safeParse(JSON.parse(result.body));
      if (
        data.success &&
        data.data.error.details?.some((value) => value.errorCode === 'UNREGISTERED')
      )
        return { accepted: false, invalidatedAt: attemptedAt };
    }
    if (result.status === 401) this.access = undefined;
    throw new Error('PUSH_UNAVAILABLE');
  }
}
export class PushProviders implements PushProvider {
  constructor(
    private readonly apple: PushProvider | undefined,
    private readonly android: PushProvider | undefined,
  ) {}
  available(registration: PushRegistration) {
    const provider = registration.platform === 'android' ? this.android : this.apple;
    return Boolean(provider && (!provider.available || provider.available(registration)));
  }
  send(registration: PushRegistration, event: WakeEvent, options?: PushDeliveryOptions) {
    const provider = registration.platform === 'android' ? this.android : this.apple;
    if (!provider) throw new Error('PUSH_UNAVAILABLE');
    return provider.send(registration, event, options);
  }
}
