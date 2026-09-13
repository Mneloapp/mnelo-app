import {
  createSecureSessionStorage,
  type SecureKeyValueStore,
} from '@/services/supabase/secure-session-storage';
function fixture() {
  const data = new Map<string, string>();
  const store: SecureKeyValueStore = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
  return { data, store, storage: createSecureSessionStorage(store) };
}
it('segments Unicode below the historical native value limit and round-trips without truncation', async () => {
  const { data, storage } = fixture();
  const value = JSON.stringify({ session: '🔒ქართული'.repeat(1000) });
  await storage.setItem('mnelo.auth', value);
  expect(await storage.getItem('mnelo.auth')).toBe(value);
  expect([...data.values()].every((v) => Buffer.byteLength(v, 'utf8') <= 1600)).toBe(true);
});
it('rotates slots and removes the superseded session material', async () => {
  const { data, storage } = fixture();
  await storage.setItem('mnelo.auth', 'old-session');
  await storage.setItem('mnelo.auth', 'new-session');
  expect(await storage.getItem('mnelo.auth')).toBe('new-session');
  expect([...data.values()].join('')).not.toContain('old-session');
});
it('an interrupted write preserves the previously committed complete session', async () => {
  const { data, storage, store } = fixture();
  await storage.setItem('mnelo.auth', 'old-session');
  const write = store.setItemAsync;
  store.setItemAsync = async (k, v) => {
    if (k === 'mnelo.auth.b.1') throw new Error('injected native failure');
    await write(k, v);
  };
  await expect(storage.setItem('mnelo.auth', 'x'.repeat(900))).rejects.toThrow(
    'injected native failure',
  );
  expect(await storage.getItem('mnelo.auth')).toBe('old-session');
  await storage.removeItem('mnelo.auth');
  expect(data.size).toBe(0);
});
it('logout removes both active and incomplete slots', async () => {
  const { data, storage } = fixture();
  await storage.setItem('mnelo.auth', 'session');
  data.set('mnelo.auth.b.count', '1');
  data.set('mnelo.auth.b.0', 'partial');
  await storage.removeItem('mnelo.auth');
  expect(data.size).toBe(0);
  expect(await storage.getItem('mnelo.auth')).toBeNull();
});
it('does not return a truncated session after missing native data', async () => {
  const { data, storage } = fixture();
  await storage.setItem('mnelo.auth', 'x'.repeat(900));
  data.delete('mnelo.auth.a.1');
  expect(await storage.getItem('mnelo.auth')).toBeNull();
  expect(data.size).toBe(0);
});
it('serializes simultaneous session updates', async () => {
  const { storage } = fixture();
  await Promise.all([
    storage.setItem('mnelo.auth', 'first'),
    storage.setItem('mnelo.auth', 'second'),
  ]);
  expect(await storage.getItem('mnelo.auth')).toBe('second');
});
it('rejects an oversized value before altering the current session', async () => {
  const { storage } = fixture();
  await storage.setItem('mnelo.auth', 'valid');
  await expect(storage.setItem('mnelo.auth', 'x'.repeat(25601))).rejects.toThrow(
    'SESSION_STORAGE_SIZE_INVALID',
  );
  expect(await storage.getItem('mnelo.auth')).toBe('valid');
});
it('rejects unexpected storage namespaces', async () => {
  await expect(fixture().storage.setItem('../unsafe', 'value')).rejects.toThrow(
    'SESSION_STORAGE_KEY_INVALID',
  );
});
