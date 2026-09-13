import { z } from 'zod';
import { internationalPhone } from '../src/messenger/phone-protocol';
import type { SmsVerification } from './verification';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const unavailable = () => new Error('PHONE_PROVIDER_UNAVAILABLE');
type Configuration = { baseUrl: string; apiKey: string; applicationId: string; messageId: string };

export function infobipConfiguration(env: Record<string, string | undefined>): Configuration {
  return {
    baseUrl: env.INFOBIP_BASE_URL ?? '',
    apiKey: env.INFOBIP_API_KEY ?? '',
    applicationId: env.INFOBIP_2FA_APPLICATION_ID ?? '',
    messageId: env.INFOBIP_2FA_MESSAGE_ID ?? '',
  };
}

// Server-only adapter. A provider PIN ID is an ephemeral challenge, not a Mnelo identity.
export function infobipSms(
  input: Configuration,
  request: typeof fetch = fetch,
): SmsVerification & { validateSetup(): Promise<void> } {
  const parsed = z
    .object({
      baseUrl: z.url(),
      apiKey: z.string().regex(/^[\x21-\x7e]{16,256}$/),
      applicationId: identifier,
      messageId: identifier,
    })
    .safeParse(input);
  if (!parsed.success) throw new Error('IDENTITY_CONFIGURATION_INVALID');
  const config = parsed.data;
  const base = new URL(config.baseUrl);
  // Never forward credentials to a custom host, URL path, userinfo or redirect.
  if (
    base.protocol !== 'https:' ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)?api\.infobip\.com$/.test(base.hostname) ||
    base.port ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  )
    throw new Error('IDENTITY_CONFIGURATION_INVALID');

  async function execute(
    path: string,
    body?: object,
    signal = AbortSignal.timeout(10000),
  ): Promise<unknown> {
    try {
      const response = await request(base.origin + '/2fa/2/' + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'App ' + config.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
        redirect: 'error',
        cache: 'no-store',
      });
      if (response.status === 429) throw new Error('PHONE_RATE_LIMITED');
      if (response.status === 404 && path.startsWith('pin/')) throw new Error('PHONE_CODE_EXPIRED');
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch (error) {
      if (
        error instanceof Error &&
        ['PHONE_RATE_LIMITED', 'PHONE_CODE_EXPIRED'].includes(error.message)
      )
        throw new Error(error.message);
      // Provider responses and network exceptions can contain numbers, codes or credentials.
      throw unavailable();
    }
  }

  async function validateSetup(signal = AbortSignal.timeout(10000)) {
    const applicationPath = 'applications/' + config.applicationId;
    const application = z
      .object({
        applicationId: identifier,
        enabled: z.literal(true),
        configuration: z.object({
          pinAttempts: z.number().int().min(1).max(5),
          allowMultiplePinVerifications: z.literal(false),
          pinTimeToLive: z.literal('10m'),
        }),
      })
      .safeParse(await execute(applicationPath, undefined, signal));
    if (!application.success || application.data.applicationId !== config.applicationId)
      throw new Error('IDENTITY_CONFIGURATION_INVALID');
    const template = z
      .object({
        applicationId: identifier,
        messageId: identifier,
        pinType: z.literal('NUMERIC'),
        pinLength: z.literal(6),
      })
      .safeParse(
        await execute(applicationPath + '/messages/' + config.messageId, undefined, signal),
      );
    if (
      !template.success ||
      template.data.applicationId !== config.applicationId ||
      template.data.messageId !== config.messageId
    )
      throw new Error('IDENTITY_CONFIGURATION_INVALID');
  }

  return {
    testOnly: false,
    validateSetup,
    async send(phone) {
      const number = internationalPhone.safeParse(phone);
      if (!number.success) throw new Error('PHONE_REQUEST_FAILED');
      // Check the remote six-digit/single-use policy before spending an SMS, even after edits.
      const deadline = AbortSignal.timeout(10000);
      await validateSetup(deadline);
      const sent = z
        .object({ pinId: identifier, to: z.string(), smsStatus: z.literal('MESSAGE_SENT') })
        .safeParse(
          await execute(
            'pin?ncNeeded=false',
            {
              applicationId: config.applicationId,
              messageId: config.messageId,
              to: number.data.slice(1),
              trackDelivery: false,
            },
            deadline,
          ),
        );
      if (!sent.success || sent.data.to.replace(/^\+/, '') !== number.data.slice(1))
        throw unavailable();
      return sent.data.pinId;
    },
    async check(verification, code) {
      if (!identifier.safeParse(verification).success || !/^\d{6}$/.test(code))
        throw new Error('PHONE_REQUEST_FAILED');
      const verified = z
        .object({ pinId: identifier, verified: z.boolean() })
        .safeParse(await execute('pin/' + verification + '/verify', { pin: code }));
      if (!verified.success || verified.data.pinId !== verification) throw unavailable();
      return verified.data.verified;
    },
  };
}
