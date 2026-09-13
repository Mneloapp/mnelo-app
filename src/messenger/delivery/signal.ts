import { z } from 'zod';
import { publicSignalIdentity, oneTimeSignalKey, type SignalBundle } from './schema';

// Opaque state is SQLCipher-only. Never include it in directory/network types.
export type SignalState = string & { readonly __signalState: unique symbol };
export type PublicKeys = z.infer<typeof publicKeys>;
export const publicKeys = publicSignalIdentity.extend({
  oneTime: z.array(oneTimeSignalKey).max(200),
});
export type SignalResult<T> = { state: SignalState; result: T };
export interface SignalProvider {
  needsBundle(state: SignalState, peer: string): Promise<boolean>;
  create(count?: number): Promise<SignalResult<PublicKeys>>;
  public(state: SignalState): Promise<SignalResult<PublicKeys>>;
  replenish(state: SignalState, count: number): Promise<SignalResult<PublicKeys>>;
  encrypt(
    state: SignalState,
    input: {
      own: string;
      peer: string;
      expectedIdentity: string;
      message: string;
      bundle?: SignalBundle;
    },
  ): Promise<SignalResult<{ type: 2 | 3; message: string }>>;
  decrypt(
    state: SignalState,
    input: { own: string; peer: string; expectedIdentity: string; type: 2 | 3; message: string },
  ): Promise<SignalResult<{ message: string }>>;
}
export type NativeSignalModule = { version(): string; run(input: string): Promise<string> };
export class VendorSignal implements SignalProvider {
  constructor(private readonly native: NativeSignalModule) {
    if (native.version() !== '0.102.2') throw new Error('SIGNAL_UPDATE_REQUIRED');
  }
  private async run<T>(
    operation: string,
    state: SignalState | null,
    params: Record<string, unknown>,
    result: z.ZodType<T>,
  ): Promise<SignalResult<T>> {
    const encoded = await this.native.run(
      JSON.stringify({ operation, ...(state ? { state: JSON.parse(state) } : {}), ...params }),
    );
    if (encoded.length > 4_000_000) throw new Error('SIGNAL_STATE_CAPACITY');
    const output = z
      .object({ state: z.object({ version: z.literal(1) }).passthrough(), result })
      .strict()
      .parse(JSON.parse(encoded));
    return { state: JSON.stringify(output.state) as SignalState, result: output.result };
  }
  create(count = 50) {
    return this.run('create', null, { count }, publicKeys);
  }
  public(state: SignalState) {
    return this.run('public', state, {}, publicKeys);
  }
  async needsBundle(state: SignalState, peer: string) {
    return (await this.run('session', state, { peer }, z.object({ needed: z.boolean() }).strict()))
      .result.needed;
  }
  replenish(state: SignalState, count: number) {
    return this.run('replenish', state, { count }, publicKeys);
  }
  encrypt(state: SignalState, input: Parameters<SignalProvider['encrypt']>[1]) {
    return this.run(
      'encrypt',
      state,
      input,
      z
        .object({ type: z.union([z.literal(2), z.literal(3)]), message: z.string().max(180000) })
        .strict(),
    );
  }
  decrypt(state: SignalState, input: Parameters<SignalProvider['decrypt']>[1]) {
    return this.run(
      'decrypt',
      state,
      input,
      z.object({ message: z.string().max(180000) }).strict(),
    );
  }
}
