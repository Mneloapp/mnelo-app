import { bytesToBase64, base64ToBytes } from './delivery/media-crypto';
import type { LocalDatabase, SQLValue } from './model';

export type OwnedDatabaseBridge = {
  databaseOpen(key: string): Promise<string>;
  databaseExec(id: string, sql: string): Promise<void>;
  databaseAll(id: string, sql: string, values: unknown[]): Promise<Record<string, unknown>[]>;
  databaseClose(id: string): Promise<void>;
  databaseIsSuspended(id: string): boolean;
  addListener(
    event: 'databaseExpired',
    listener: (event: { id: string }) => void,
  ): { remove(): void };
};

// Each adapter remains bound to one native generation. A retired transaction
// can never resume against a newly opened connection after foreground recovery.
export async function openOwnedDatabase(
  bridge: OwnedDatabaseBridge,
  key: string,
): Promise<LocalDatabase> {
  let id: string;
  try {
    id = await bridge.databaseOpen(key);
  } catch (error) {
    // Opening can exhaust its native background assertion before a token and
    // event listener exist. Normalize this bridge error like later operations.
    if (error instanceof Error && error.message.includes('DATABASE_SUSPENDED'))
      throw new Error('DATABASE_SUSPENDED');
    throw error;
  }
  const listeners = new Set<() => void>();
  let suspended = false;
  let closed = false;
  let closing: Promise<void> | undefined;
  const notify = () => {
    if (closed || suspended) return;
    suspended = true;
    listeners.forEach((listener) => listener());
  };
  const events = bridge.addListener('databaseExpired', (event) => {
    if (event.id === id) notify();
  });
  async function run<T>(work: () => Promise<T>): Promise<T> {
    if (closed) throw new Error('DATABASE_CLOSED');
    if (suspended || bridge.databaseIsSuspended(id)) {
      notify();
      throw new Error('DATABASE_SUSPENDED');
    }
    try {
      return await work();
    } catch (error) {
      if (
        bridge.databaseIsSuspended(id) ||
        (error instanceof Error && error.message.includes('DATABASE_SUSPENDED'))
      ) {
        notify();
        throw new Error('DATABASE_SUSPENDED');
      }
      throw error;
    }
  }
  const encode = (value: SQLValue) =>
    value instanceof Uint8Array ? { __mneloBlob: bytesToBase64(value) } : value;
  return {
    exec: (sql) => run(() => bridge.databaseExec(id, sql)),
    run: (sql, ...params) =>
      run(async () => {
        await bridge.databaseAll(id, sql, params.map(encode));
      }),
    all: <T>(sql: string, ...params: SQLValue[]) =>
      run(async () => {
        const rows = await bridge.databaseAll(id, sql, params.map(encode));
        return rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([column, value]) => [
              column,
              value &&
              typeof value === 'object' &&
              '__mneloBlob' in value &&
              typeof value.__mneloBlob === 'string'
                ? base64ToBytes(value.__mneloBlob)
                : value,
            ]),
          ),
        ) as T[];
      }),
    close() {
      if (!closing) {
        closed = true;
        events.remove();
        listeners.clear();
        closing = bridge.databaseClose(id);
      }
      return closing;
    },
    observeSuspension(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isSuspended: () => suspended || (!closed && bridge.databaseIsSuspended(id)),
  };
}
