/** Segmentation only: encryption is provided exclusively by the OS SecureStore implementation. */
export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
const maxParts = 64;
const partCharacters = 400; // At most 1600 UTF-8 bytes even for supplementary Unicode characters.
type Slot = 'a' | 'b';
export function createSecureSessionStorage(store: SecureKeyValueStore) {
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action, action);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function validateKey(key: string) {
    if (!/^[A-Za-z0-9._-]{1,160}$/.test(key)) throw new Error('SESSION_STORAGE_KEY_INVALID');
  }
  async function count(key: string, slot: Slot) {
    const value = await store.getItemAsync(`${key}.${slot}.count`);
    if (value === null) return 0;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= maxParts ? n : maxParts;
  }
  async function clearSlot(key: string, slot: Slot) {
    const n = await count(key, slot);
    for (let i = 0; i < n; i++) await store.deleteItemAsync(`${key}.${slot}.${i}`);
    await store.deleteItemAsync(`${key}.${slot}.count`);
  }
  async function remove(key: string) {
    // Remove the commit pointer first. A partial cleanup cannot restore a logged-out session.
    await store.deleteItemAsync(key);
    await clearSlot(key, 'a');
    await clearSlot(key, 'b');
  }
  return {
    getItem(key: string): Promise<string | null> {
      return serialized(async () => {
        validateKey(key);
        const active = await store.getItemAsync(key);
        if (active === null) return null;
        if (active !== 'a' && active !== 'b') {
          await remove(key);
          return null;
        }
        const n = await count(key, active);
        if (!n) {
          await remove(key);
          return null;
        }
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const part = await store.getItemAsync(`${key}.${active}.${i}`);
          if (part === null) {
            await remove(key);
            return null;
          }
          parts.push(part);
        }
        return parts.join('');
      });
    },
    setItem(key: string, value: string): Promise<void> {
      return serialized(async () => {
        validateKey(key);
        const characters = Array.from(value);
        const n = Math.ceil(characters.length / partCharacters);
        if (n > maxParts || n === 0) throw new Error('SESSION_STORAGE_SIZE_INVALID');
        const old = await store.getItemAsync(key);
        const next: Slot = old === 'a' ? 'b' : 'a';
        await clearSlot(key, next);
        // Record pending count before chunks so interrupted writes can always be removed.
        await store.setItemAsync(`${key}.${next}.count`, String(n));
        for (let i = 0; i < n; i++) {
          await store.setItemAsync(
            `${key}.${next}.${i}`,
            characters.slice(i * partCharacters, (i + 1) * partCharacters).join(''),
          );
        }
        // Single SecureStore write commits the complete alternate slot.
        await store.setItemAsync(key, next);
        if (old === 'a' || old === 'b') await clearSlot(key, old);
      });
    },
    removeItem(key: string): Promise<void> {
      return serialized(async () => {
        validateKey(key);
        await remove(key);
      });
    },
  };
}
