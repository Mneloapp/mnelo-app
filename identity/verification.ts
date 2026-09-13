import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export interface SmsVerification {
  readonly testOnly: boolean;
  send(phone: string): Promise<string>;
  check(verification: string, code: string): Promise<boolean>;
}
// NANP's reserved fictional 555-0100..0199 range, never real subscriber numbers.
export const fixturePhones = new Set(['+12025550101', '+12025550102']);
export function fixtureSms(local: boolean): SmsVerification {
  if (!local) throw new Error('FIXTURE_REQUIRES_LOCAL');
  return {
    testOnly: true,
    async send(phone) {
      if (!fixturePhones.has(phone)) throw new Error('FIXTURE_PHONE_REQUIRED');
      return randomUUID();
    },
    async check(_verification, code) {
      return code === '864209';
    },
  };
}
export function twilioSms(
  input: { account: string; token: string; service: string },
  request: typeof fetch = fetch,
): SmsVerification {
  const config = z
    .object({
      account: z.string().regex(/^AC[a-fA-F0-9]{32}$/),
      token: z.string().min(20),
      service: z.string().regex(/^VA[a-fA-F0-9]{32}$/),
    })
    .parse(input);
  async function post(path: string, body: Record<string, string>) {
    const response = await request(
      `https://verify.twilio.com/v2/Services/${config.service}/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(config.account + ':' + config.token).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      },
    );
    if (response.status === 404 && path === 'VerificationCheck')
      throw new Error('PHONE_CODE_EXPIRED');
    if (!response.ok)
      throw new Error(
        response.status === 429 ? 'PHONE_RATE_LIMITED' : 'PHONE_PROVIDER_UNAVAILABLE',
      );
    return z
      .object({ sid: z.string().regex(/^VE[a-fA-F0-9]{32}$/), status: z.string() })
      .parse(await response.json());
  }
  return {
    testOnly: false,
    async send(phone) {
      return (await post('Verifications', { To: phone, Channel: 'sms' })).sid;
    },
    async check(verification, code) {
      return (
        (await post('VerificationCheck', { VerificationSid: verification, Code: code })).status ===
        'approved'
      );
    },
  };
}
