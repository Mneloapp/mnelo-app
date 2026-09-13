import { createHmac } from 'node:crypto';
import { internationalPhone } from '../src/messenger/phone-protocol';

const admissionName = 'MNELO_ALLOWED_PHONE_INDICES';
const fields = [
  'INFOBIP_BASE_URL',
  'INFOBIP_API_KEY',
  'INFOBIP_2FA_APPLICATION_ID',
  'INFOBIP_2FA_MESSAGE_ID',
  'MNELO_HOSTED_IDENTITY',
  admissionName,
];

// Replace only the development admission list, never provider settings or the
// registry's HMAC key. Accept canonical phone input and return indexes only.
export function prepareTesterConfiguration(config: string, key: Uint8Array, input: unknown) {
  const fail = () => new Error('HOSTED_TESTER_CONFIGURATION_INVALID');
  if (key.length !== 32 || config.length > 16384 || !config.endsWith('\n')) throw fail();
  const lines = config.slice(0, -1).split('\n');
  const values = new Map<string, string>();
  for (const line of lines) {
    const match = /^([A-Z_0-9]+)=("[^\r\n]*")$/.exec(line);
    if (!match || !fields.includes(match[1]!) || values.has(match[1]!)) throw fail();
    let value: unknown;
    try {
      value = JSON.parse(match[2]!);
    } catch {
      throw fail();
    }
    if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value)) throw fail();
    values.set(match[1]!, value);
  }
  if (values.size !== fields.length || values.get('MNELO_HOSTED_IDENTITY') !== 'development')
    throw fail();
  const previous = values.get(admissionName)!.split(',');
  if (
    previous.length > 50 ||
    previous.some((index) => !/^[a-f0-9]{64}$/.test(index)) ||
    new Set(previous).size !== previous.length ||
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > 50 ||
    input.some((phone) => !internationalPhone.safeParse(phone).success) ||
    new Set(input).size !== input.length
  )
    throw fail();
  const indexes = input.map((phone: string) =>
    createHmac('sha256', key)
      .update('mnelo-phone-index-v1:' + phone)
      .digest('hex'),
  );
  const next =
    lines
      .map((line) =>
        line.startsWith(admissionName + '=')
          ? admissionName + '=' + JSON.stringify(indexes.join(','))
          : line,
      )
      .join('\n') + '\n';
  return { config: next, count: indexes.length, changed: next !== config };
}
