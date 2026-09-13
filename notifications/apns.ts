import { connect, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { PushRegistration, WakeEvent } from '../src/messenger/wake-protocol';
export type PushResult = { accepted: boolean; invalidatedAt?: number };
export type PushDeliveryOptions = { expiresAt: number; missedCall?: boolean };
export interface PushProvider {
  available?(registration: PushRegistration): boolean;
  send(
    registration: PushRegistration,
    event: WakeEvent,
    options?: PushDeliveryOptions,
  ): Promise<PushResult>;
}
type Request = (
  origin: string,
  headers: Record<string, string>,
  body: string,
) => Promise<{ status: number; body: string }>;
export function apnsPayload(event: WakeEvent, now = Date.now(), options?: PushDeliveryOptions) {
  return event.kind === 'message'
    ? {
        aps: {
          alert: { title: 'Mnelo', body: options?.missedCall ? 'Missed call' : 'New message' },
          sound: 'default',
        },
        mnelo: { v: 1, ...event },
      }
    : {
        aps: {},
        mnelo: { v: 1, ...event, expires: Math.min(now + 60000, options?.expiresAt ?? Infinity) },
      };
}
const sessions = new Map<string, ClientHttp2Session>();
const request: Request = (origin, headers, body) =>
  new Promise((resolve, reject) => {
    let session = sessions.get(origin);
    if (!session || session.destroyed || session.closed) {
      session = connect(origin);
      sessions.set(origin, session);
      const created = session;
      session.on('error', () => {
        if (sessions.get(origin) === created) sessions.delete(origin);
        created.destroy();
      });
      session.on('goaway', () => {
        if (sessions.get(origin) === created) sessions.delete(origin);
        created.close();
      });
      session.unref();
    }
    const stream = session.request(headers);
    let status = 0;
    let text = '';
    const timeout = setTimeout(() => stream.destroy(new Error('PUSH_UNAVAILABLE')), 10000);
    stream.on('response', (response) => {
      status = Number(response[':status']);
    });
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      text += chunk;
      if (text.length > 4096) stream.destroy(new Error('PUSH_UNAVAILABLE'));
    });
    stream.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('PUSH_UNAVAILABLE'));
    });
    stream.on('end', () => {
      clearTimeout(timeout);
      resolve({ status, body: text });
    });
    stream.end(body);
  });
export class ApplePushProvider implements PushProvider {
  private readonly key: KeyObject;
  private cached: { value: string; expires: number } | undefined;
  constructor(
    private readonly team: string,
    private readonly keyId: string,
    pem: string,
    private readonly transport: Request = request,
    private readonly now = Date.now,
  ) {
    if (!/^[A-Z0-9]{10}$/.test(team) || !/^[A-Z0-9]{10}$/.test(keyId))
      throw new Error('PUSH_CONFIGURATION_INVALID');
    this.key = createPrivateKey(pem);
    if (
      this.key.asymmetricKeyType !== 'ec' ||
      this.key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    )
      throw new Error('PUSH_CONFIGURATION_INVALID');
  }
  private authorization() {
    if (this.cached && this.cached.expires > this.now()) return this.cached.value;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned =
      encode({ alg: 'ES256', kid: this.keyId }) +
      '.' +
      encode({ iss: this.team, iat: Math.floor(this.now() / 1000) });
    const signature = sign('sha256', Buffer.from(unsigned), {
      key: this.key,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');
    const value = 'bearer ' + unsigned + '.' + signature;
    this.cached = { value, expires: this.now() + 40 * 60000 };
    return value;
  }
  async send(
    registration: PushRegistration,
    event: WakeEvent,
    options?: PushDeliveryOptions,
  ): Promise<PushResult> {
    if (registration.platform === 'android') throw new Error('PUSH_CHANNEL_INVALID');
    if ((event.kind === 'call') !== (registration.channel === 'voip'))
      throw new Error('PUSH_CHANNEL_INVALID');
    const origin =
      registration.environment === 'sandbox'
        ? 'https://api.sandbox.push.apple.com'
        : 'https://api.push.apple.com';
    const result = await this.transport(
      origin,
      {
        ':method': 'POST',
        ':path': '/3/device/' + registration.token,
        authorization: this.authorization(),
        'apns-topic': 'com.mnelo.messenger' + (event.kind === 'call' ? '.voip' : ''),
        'apns-push-type': event.kind === 'call' ? 'voip' : 'alert',
        'apns-priority': '10',
        // Live rings are never stored. Queued message/missed-call hints may
        // survive offline devices, bounded by the original envelope deadline.
        'apns-expiration':
          event.kind === 'call' || !options
            ? '0'
            : String(Math.floor(Math.min(options.expiresAt, this.now() + 30 * 86400000) / 1000)),
        'apns-id': event.id,
        'content-type': 'application/json',
      },
      JSON.stringify(apnsPayload(event, this.now(), options)),
    );
    if (result.status === 200) return { accepted: true };
    if (result.status === 410) {
      try {
        const data: unknown = JSON.parse(result.body);
        if (
          data &&
          typeof data === 'object' &&
          'timestamp' in data &&
          typeof data.timestamp === 'number' &&
          Number.isFinite(data.timestamp)
        )
          return { accepted: false, invalidatedAt: data.timestamp };
      } catch {
        /* Untrusted APNs failure body is never logged. */
      }
    }
    if (result.status === 403) this.cached = undefined;
    throw new Error('PUSH_UNAVAILABLE');
  }
}
// Topic-scoped Apple keys belong to one environment. Do not reuse a development
// key for TestFlight or broaden its access to the owner's other applications.
export class ApplePushEnvironments implements PushProvider {
  constructor(
    private readonly providers: Partial<Record<'sandbox' | 'production', PushProvider>>,
  ) {}
  available(registration: PushRegistration) {
    return registration.platform !== 'android' && Boolean(this.providers[registration.environment]);
  }
  send(registration: PushRegistration, event: WakeEvent, options?: PushDeliveryOptions) {
    const provider = this.providers[registration.environment];
    if (!provider) throw new Error('PUSH_UNAVAILABLE');
    return provider.send(registration, event, options);
  }
}
