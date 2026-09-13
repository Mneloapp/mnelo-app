import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { localContext } from './local-context';
import { createSecureSessionStorage } from '../../src/services/supabase/secure-session-storage';
const context = localContext();
const phone = '+15555550103';
test('local Auth: delivery gate, OTP, session restore, refresh and logout', async () => {
  // Reset only the reserved integration identity, never arbitrary users or any remote account.
  const listing = await context.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.equal(listing.error?.code, undefined, 'Local fixture lookup succeeds');
  for (const u of listing.data.users.filter(
    (u) => u.phone === '15555550103' || u.phone === '15555550999',
  )) {
    const deletion = await context.admin.auth.admin.deleteUser(u.id);
    assert.equal(deletion.error?.code, undefined, 'Reserved fixture reset succeeds');
  }
  const data = new Map<string, string>();
  const storage = createSecureSessionStorage({
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  });
  const options = {
    auth: {
      storage,
      storageKey: 'mnelo.test.auth',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const a = createClient(context.url, context.key, options);
  const unavailable = await a.auth.signInWithOtp({ phone: '+15555550999' });
  assert.ok(unavailable.error, 'Nonfixture phone is rejected by the no-delivery hook');
  const sent = await a.auth.signInWithOtp({ phone });
  assert.equal(sent.error?.code, undefined, 'Reserved OTP send succeeds without SMS');
  const throttled = await a.auth.signInWithOtp({ phone });
  assert.equal(throttled.error?.status, 429, 'Server enforces resend rate limit');
  const invalid = await a.auth.verifyOtp({ phone, token: '000000', type: 'sms' });
  assert.ok(invalid.error, 'Wrong OTP denied');
  const signed = await a.auth.verifyOtp({ phone, token: '345678', type: 'sms' });
  assert.equal(signed.error?.code, undefined, 'Reserved OTP verification succeeds');
  assert.ok(signed.data.session, 'Auth issued an actual session');
  assert.ok(
    [...data.values()].every((v) => Buffer.byteLength(v, 'utf8') <= 1600),
    'Session storage respects native entry budget',
  );
  const restored = createClient(context.url, context.key, options);
  const user = await restored.auth.getUser();
  assert.equal(user.error?.code, undefined, 'Restored session verifies against Auth');
  assert.ok(user.data.user?.id === signed.data.user?.id, 'Restored identity matches');
  const refreshed = await restored.auth.refreshSession();
  assert.equal(refreshed.error?.code, undefined, 'Session refresh succeeds');
  assert.ok(refreshed.data.session?.access_token, 'Refresh returns a real access token');
  const previousRefresh = refreshed.data.session?.refresh_token;
  assert.ok(previousRefresh, 'Refresh token exists before logout');
  const logout = await restored.auth.signOut({ scope: 'local' });
  assert.equal(logout.error?.code, undefined, 'Current session logout succeeds');
  assert.equal(
    await storage.getItem('mnelo.test.auth'),
    null,
    'Secure session is removed after logout',
  );
  assert.equal(data.size, 0, 'No old or partial session entries remain');
  const revoked = await fetch(context.url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: context.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: previousRefresh }),
  });
  assert.ok(!revoked.ok, 'Auth server rejects the revoked refresh token');
  const reuse = await a.auth.refreshSession();
  assert.ok(
    reuse.error || !reuse.data.session,
    'Logged out session cannot refresh from cleared storage',
  );
  await a.removeAllChannels();
  await restored.removeAllChannels();
});
