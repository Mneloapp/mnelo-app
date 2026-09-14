import { ShareSession, type ShareItem } from '../../src/messenger/share-extension';
import { VendorSignal } from '../../src/messenger/delivery/signal';
import { bytesToBase64, base64ToBytes } from '../../src/messenger/delivery/media-crypto';
import type { SQLValue } from '../../src/messenger/model';

declare function __native(operation: string, input: string): string;
declare function __result(id: string, result: string): void;
function native<T>(operation: string, input: unknown = null): T {
  const result = JSON.parse(__native(operation, JSON.stringify(input)));
  if (result.error) throw new Error(result.error);
  return result.value;
}
function revive(_key: string, value: unknown) {
  return value && typeof value === 'object' && '__blob' in value && typeof value.__blob === 'string'
    ? base64ToBytes(value.__blob)
    : value;
}
const params = (values: SQLValue[]) =>
  values.map((v) => (v instanceof Uint8Array ? { __blob: bytesToBase64(v) } : v));
const session = new ShareSession({
  db: {
    async exec(sql) {
      native('exec', { sql });
    },
    async run(sql, ...values) {
      native('run', { sql, params: params(values) });
    },
    async all<T>(sql: string, ...values: SQLValue[]): Promise<T[]> {
      return JSON.parse(native<string>('all', { sql, params: params(values) }), revive);
    },
    async close() {
      native('close');
    },
  },
  random: (count) => Uint8Array.from(native<number[]>('random', count)),
  uuid: () => native<string>('uuid'),
  signal: new VendorSignal({
    version: () => '0.102.2',
    async run(input) {
      return native<string>('signal', input);
    },
  }),
  request: fetch,
  item: (index) => native<ShareItem>('item', index),
  count: native<number>('count'),
});
// The only native entry points; no eval, remote modules or arbitrary file paths.
Object.assign(globalThis, {
  MneloShare: (id: string, operation: string, argument: string) => {
    const task =
      operation === 'open'
        ? session.open()
        : operation === 'send'
          ? session.send(argument)
          : session.close();
    void task
      .then((value) => __result(id, JSON.stringify({ value: value ?? null })))
      .catch((error: unknown) => {
        const code = error instanceof Error ? error.message : '';
        __result(
          id,
          JSON.stringify({ error: /^[A-Z_]{1,64}$/.test(code) ? code : 'SHARE_FAILED' }),
        );
      });
  },
});
