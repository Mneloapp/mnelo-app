import { z } from 'zod';
import { sign } from './crypto';
import {
  phoneCommand,
  phoneProofPayload,
  phoneResponse,
  phoneServiceAddress,
  type PhoneCommand,
} from './phone-protocol';
import type { LocalIdentity } from './model';
import { phoneRequestScheduler, type PhoneRequestScheduler } from './phone-request-queue';
export class PhoneClient {
  constructor(
    private readonly address: string,
    private readonly identity: Pick<LocalIdentity, 'key' | 'secret'>,
    private readonly request: typeof fetch = fetch,
    private readonly schedule: PhoneRequestScheduler = (operation) => operation(),
    private readonly requestTimeout = 15000,
  ) {}
  private async post(path: string, body: unknown) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeout);
    try {
      const response = await this.request(this.address + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      // Bound declared and actual responses; the delivery inbox is paginated.
      const limit = path === '/delivery' ? 2_000_000 : 16384;
      if (Number(response.headers.get('content-length') ?? 0) > limit)
        throw new Error('PHONE_RESPONSE_INVALID');
      const encoded = await response.text();
      if (encoded.length > limit) throw new Error('PHONE_RESPONSE_INVALID');
      const value: unknown = JSON.parse(encoded);
      if (!response.ok) {
        const error = z
          .object({
            code: z
              .string()
              .regex(/^[A-Z_]+$/)
              .max(64),
          })
          .safeParse(value);
        throw new Error(error.success ? error.data.code : 'PHONE_REQUEST_FAILED');
      }
      return value;
    } finally {
      clearTimeout(timeout);
    }
  }
  async execute(input: PhoneCommand, urgent = false) {
    const command = phoneCommand.parse(input);
    return this.schedule(() => this.executeCommand(command), urgent || command.action === 'ice');
  }
  private async executeCommand(command: PhoneCommand) {
    const { nonce } = z
      .object({ nonce: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(await this.post('/challenge', { key: this.identity.key }));
    const signature = sign(
      this.identity.secret,
      phoneProofPayload(this.identity.key, nonce, command),
    );
    return phoneResponse.parse(
      await this.post(command.action.startsWith('delivery-') ? '/delivery' : '/execute', {
        key: this.identity.key,
        nonce,
        signature,
        command,
      }),
    );
  }
}
export function configuredPhoneService() {
  return phoneServiceAddress(
    process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
    (process.env.EXPO_PUBLIC_APP_ENV || 'local') === 'local',
  );
}
export function devicePhoneClient(identity: LocalIdentity | null) {
  const address = configuredPhoneService();
  return address && identity ? scheduledPhoneClient(address, identity) : null;
}
export function scheduledPhoneClient(
  address: string,
  identity: Pick<LocalIdentity, 'key' | 'secret'>,
  request: typeof fetch = fetch,
  requestTimeout = 15000,
) {
  return new PhoneClient(
    address,
    identity,
    request,
    phoneRequestScheduler(address, identity.key),
    requestTimeout,
  );
}
