import { z } from 'zod';
import { internationalPhone } from '../src/messenger/phone-protocol';
import type { SmsVerification } from './verification';

const requestId = z.string().uuid();
const responseBody = z.object({ request_id: requestId, status: z.string().optional() });
const unavailable = () => new Error('PHONE_PROVIDER_UNAVAILABLE');

// Verify V2 Basic auth is supported for the owner-controlled SMS trial.
// Credentials and provider request IDs never become Mnelo account credentials.
export function vonageSms(
  input: { apiKey: string; apiSecret: string },
  request: typeof fetch = fetch,
): SmsVerification {
  const config = z
    .object({
      apiKey: z.string().regex(/^[a-zA-Z0-9_-]{6,128}$/),
      apiSecret: z.string().min(8).max(256),
    })
    .safeParse(input);
  if (!config.success) throw new Error('IDENTITY_CONFIGURATION_INVALID');
  const authorization =
    'Basic ' + Buffer.from(config.data.apiKey + ':' + config.data.apiSecret).toString('base64');

  async function post(path: string, body: object) {
    let response: Response;
    let json: unknown;
    try {
      response = await request('https://api.nexmo.com/v2/verify' + path, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 429) throw new Error('PHONE_RATE_LIMITED');
      json = await response.json();
    } catch (error) {
      if (error instanceof Error && error.message === 'PHONE_RATE_LIMITED') throw error;
      // Do not surface network exception messages or provider payloads (PII/credentials).
      throw unavailable();
    }
    if (!response.ok) {
      const problem = z.object({ type: z.string() }).safeParse(json);
      const type = problem.success ? problem.data.type : '';
      const code =
        /^https:\/\/developer\.vonage\.com\/(?:en\/)?api-errors\/verify(?:\.v2|-v2)#([a-z-]+)$/.exec(
          type,
        )?.[1];
      if ([400, 404, 409, 410, 422].includes(response.status)) {
        if (code === 'concurrent') throw new Error('PHONE_RATE_LIMITED');
        if (path && code === 'invalid-code') return null;
        if (path && (code === 'expired' || code === 'request-not-found'))
          throw new Error('PHONE_CODE_EXPIRED');
      }
      throw unavailable();
    }
    const result = responseBody.safeParse(json);
    if (!result.success) throw unavailable();
    return result.data;
  }

  return {
    testOnly: false,
    async send(phone) {
      const number = internationalPhone.safeParse(phone);
      if (!number.success) throw new Error('PHONE_REQUEST_FAILED');
      const result = await post('', {
        brand: 'Mnelo',
        code_length: 6,
        channel_timeout: 600,
        workflow: [{ channel: 'sms', to: number.data.slice(1) }],
      });
      if (!result) throw unavailable();
      return result.request_id;
    },
    async check(verification, code) {
      if (!requestId.safeParse(verification).success || !/^\d{6}$/.test(code))
        throw new Error('PHONE_REQUEST_FAILED');
      const result = await post('/' + verification, { code });
      if (!result) return false;
      if (result.request_id !== verification) throw unavailable();
      return result.status === 'completed';
    },
  };
}
