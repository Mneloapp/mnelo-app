import { accountRepository } from '@/services/supabase/account-repository';
import { supabaseClient, sessionStorage } from '@/services/supabase/client';
import { createBoundedFetch } from '@/lib/bounded-fetch';
jest.mock('@/services/supabase/client', () => ({
  supabaseClient: jest.fn(),
  sessionStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  sessionStorageKey: 'mnelo.test.session',
}));
jest.mock('@/lib/env', () => ({
  env: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'local-public-fixture' },
}));
jest.mock('@/lib/bounded-fetch', () => ({ createBoundedFetch: jest.fn(() => jest.fn()) }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(42)),
}));
const transport = jest.mocked(createBoundedFetch).mock.results[0]!.value as jest.Mock;
let stored: string | null;
const reply = (status: string) => ({ ok: true, json: async () => ({ status }) });
beforeEach(() => {
  jest.clearAllMocks();
  transport.mockReset();
  stored = null;
  jest.mocked(sessionStorage.getItem).mockImplementation(async () => stored);
  jest.mocked(sessionStorage.setItem).mockImplementation(async (_key, value) => {
    stored = value;
  });
  jest.mocked(sessionStorage.removeItem).mockImplementation(async () => {
    stored = null;
  });
  jest.mocked(supabaseClient).mockReturnValue({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'explicit-local-fixture' } },
        error: null,
      }),
    },
  } as unknown as ReturnType<typeof supabaseClient>);
});
test('uncertain submission retains its receipt and a reconstructed repository resumes without submitting twice', async () => {
  transport.mockResolvedValueOnce(reply('not_found')).mockRejectedValueOnce(new Error('network'));
  await expect(accountRepository().requestAccountDeletion()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(stored).toBeTruthy();
  const receipt = stored;
  transport.mockResolvedValueOnce(reply('processing'));
  await expect(accountRepository().requestAccountDeletion()).resolves.toEqual({
    status: 'requested',
  });
  expect(stored).toBe(receipt);
  expect(transport).toHaveBeenCalledTimes(3);
  expect(JSON.parse(transport.mock.calls[2]![1].body).action).toBe('status');
});
test('processing and network failure cannot clear a deletion receipt', async () => {
  stored = JSON.stringify({
    version: 1,
    receipt: 'a'.repeat(64),
    createdAt: new Date().toISOString(),
  });
  transport.mockResolvedValueOnce(reply('processing')).mockRejectedValueOnce(new Error('offline'));
  await expect(accountRepository().clearAccountDeletionReceipt()).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(accountRepository().clearAccountDeletionReceipt()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(sessionStorage.removeItem).not.toHaveBeenCalled();
});
test('an unacknowledged request cannot be abandoned during the settlement window', async () => {
  stored = JSON.stringify({
    version: 1,
    receipt: 'b'.repeat(64),
    createdAt: new Date().toISOString(),
  });
  transport.mockResolvedValueOnce(reply('not_found'));
  await expect(accountRepository().clearAccountDeletionReceipt()).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(stored).toBeTruthy();
});
test('a deleted account checks its receipt without requiring or transmitting the old Auth token', async () => {
  stored = JSON.stringify({
    version: 1,
    receipt: 'c'.repeat(64),
    createdAt: new Date().toISOString(),
  });
  transport.mockResolvedValue(reply('deleted'));
  await expect(accountRepository().accountDeletionStatus()).resolves.toBe('deleted');
  await accountRepository().clearAccountDeletionReceipt();
  expect(stored).toBeNull();
  expect(supabaseClient).not.toHaveBeenCalled();
  expect(transport.mock.calls[0]![1].headers.Authorization).toBeUndefined();
});
test('corrupt local state fails closed instead of losing the pending deletion', async () => {
  stored = '{invalid';
  await expect(accountRepository().pendingAccountDeletion()).rejects.toBeDefined();
  expect(sessionStorage.removeItem).not.toHaveBeenCalled();
});
