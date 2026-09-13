import { authRepository } from '@/services/supabase/auth-repository';
import { supabaseClient, sessionStorage } from '@/services/supabase/client';
import { readProfile } from '@/services/supabase/profile-repository';
jest.mock('@/services/supabase/client', () => ({
  supabaseClient: jest.fn(),
  sessionStorage: { removeItem: jest.fn() },
  sessionStorageKey: 'mnelo.test.session',
}));
jest.mock('@/services/supabase/profile-repository', () => ({ readProfile: jest.fn() }));
jest.mock('@/lib/env', () => ({ env: { appEnv: 'local' } }));
function setup() {
  const client = {
    rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'explicit-development-token-fixture' } },
        error: null,
      }),
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'development-user' } }, error: null }),
      admin: { signOut: jest.fn().mockResolvedValue({ error: null }) },
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    removeAllChannels: jest.fn().mockResolvedValue([]),
  };
  jest
    .mocked(supabaseClient)
    .mockReturnValue(client as unknown as ReturnType<typeof supabaseClient>);
  return client;
}
beforeEach(() => jest.clearAllMocks());
test('a network failure never discards a retryable login before server logout is confirmed', async () => {
  const client = setup();
  client.auth.admin.signOut.mockResolvedValue({ error: { status: 503 } } as never);
  await expect(authRepository().logout()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(client.auth.signOut).not.toHaveBeenCalled();
  expect(sessionStorage.removeItem).not.toHaveBeenCalled();
});
test('logout others preserves the current SDK and local session', async () => {
  const client = setup();
  await authRepository().revokeOtherDevices();
  expect(client.auth.admin.signOut).toHaveBeenCalledWith(
    'explicit-development-token-fixture',
    'others',
  );
  expect(client.auth.signOut).not.toHaveBeenCalled();
  expect(sessionStorage.removeItem).not.toHaveBeenCalled();
});
test('confirmed logout clears SDK, local credential cache and private channels', async () => {
  const client = setup();
  await authRepository().logout();
  expect(client.auth.admin.signOut).toHaveBeenCalledWith(
    'explicit-development-token-fixture',
    'local',
  );
  expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(sessionStorage.removeItem).toHaveBeenCalledWith('mnelo.test.session');
  expect(client.removeAllChannels).toHaveBeenCalled();
});
test('a stored JWT with a revoked server session cannot restore profile access', async () => {
  const client = setup();
  client.rpc.mockResolvedValue({ data: false, error: null });
  await expect(authRepository().restoreSession()).resolves.toBeNull();
  expect(readProfile).not.toHaveBeenCalled();
  expect(sessionStorage.removeItem).toHaveBeenCalled();
});
