import type { MneloRepository } from '../repository';
import { RepositoryError } from '../repository';
import { supabaseClient, sessionStorage, sessionStorageKey } from './client';
import { repositoryError } from './errors';
import type { Session } from '@/types/domain';
import { env } from '@/lib/env';
import { readProfile } from './profile-repository';
import { localTestPhones } from '@/features/auth/phone';
export function authRepository(): Pick<
  MneloRepository,
  | 'restoreSession'
  | 'requestOtp'
  | 'verifyOtp'
  | 'logout'
  | 'watchSession'
  | 'validateSession'
  | 'forgetSession'
  | 'revokeOtherDevices'
> {
  const client = supabaseClient();
  async function validateSession() {
    const { data, error } = await client.rpc('session_active');
    if (error) throw repositoryError(error);
    return data;
  }
  async function forgetSession() {
    // Called after confirmed server revocation; clear SDK, storage and subscriptions.
    await client.auth.signOut({ scope: 'local' });
    await sessionStorage.removeItem(sessionStorageKey);
    await client.removeAllChannels();
  }
  async function serverSignOut(scope: 'local' | 'others') {
    const { data, error } = await client.auth.getSession();
    if (error) throw repositoryError(error);
    if (!data.session) throw new RepositoryError('UNAUTHORIZED');
    // SDK signOut clears local state even on network errors. Confirm Auth first.
    // This endpoint uses the current user's JWT, never a service-role credential.
    const result = await client.auth.admin.signOut(data.session.access_token, scope);
    if (result.error) throw repositoryError(result.error);
  }
  return {
    validateSession,
    forgetSession,
    async revokeOtherDevices() {
      await serverSignOut('others');
    },
    async restoreSession() {
      const { data, error } = await client.auth.getSession();
      if (error) {
        const failure = repositoryError(error);
        if (failure.code === 'UNAUTHORIZED') {
          await sessionStorage.removeItem(sessionStorageKey);
          return null;
        }
        throw failure;
      }
      if (!data.session) return null;
      // Session storage is only a cache. Verify identity against Auth before routing into the app.
      const result = await client.auth.getUser();
      if (result.error) {
        const failure = repositoryError(result.error);
        if (failure.code === 'UNAUTHORIZED') {
          await sessionStorage.removeItem(sessionStorageKey);
          return null;
        }
        throw failure;
      }
      if (!result.data.user) return null;
      if (!(await validateSession())) {
        await forgetSession();
        return null;
      }
      return { userId: result.data.user.id, profile: await readProfile(result.data.user.id) };
    },
    async requestOtp(phone) {
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new RepositoryError('INVALID');
      // Local Auth accepts only reserved test identities. Never forward real phone data to a dummy provider.
      if (env.appEnv === 'local' && !localTestPhones.has(phone))
        throw new RepositoryError('INVALID');
      const { error } = await client.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: true },
      });
      if (error) throw repositoryError(error);
      // Return the same empty success contract for new and existing accounts.
    },
    async verifyOtp(phone, code) {
      if (!/^\d{6}$/.test(code)) throw new RepositoryError('INVALID');
      if (env.appEnv === 'local' && !localTestPhones.has(phone))
        throw new RepositoryError('INVALID');
      const { data, error } = await client.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (error) throw repositoryError(error);
      if (!data.user || !data.session) throw new RepositoryError('UNAUTHORIZED');
      return { userId: data.user.id, profile: await readProfile(data.user.id) };
    },
    async logout() {
      await serverSignOut('local');
      await forgetSession();
    },
    watchSession(listener: (session: Session | null) => void) {
      const { data } = client.auth.onAuthStateChange((event) => {
        // No asynchronous SDK calls within the SDK event callback. Verification/restore happens above.
        if (event === 'SIGNED_OUT') listener(null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
