import { usePreferences } from '@/stores/preferences';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { repository } from '@/services';
import { RepositoryError } from '@/services/repository';
import { useSession } from '@/stores/session';
import { usePendingMessages } from '@/features/chats/pending-messages';
import { deviceInfo } from './device-info';
export function useDeviceSession() {
  const locale = usePreferences((s) => s.locale);
  const actor = useSession((s) => s.session?.userId);
  const cache = useQueryClient();
  useEffect(() => {
    if (!actor || repository().mode !== 'supabase') return;
    let alive = true,
      running = false,
      lastRegistration = 0;
    const clear = async () => {
      await repository().forgetSession();
      if (!alive || useSession.getState().session?.userId !== actor) return;
      cache.clear();
      usePendingMessages.getState().clear();
      useSession.getState().setSession(null);
    };
    const check = async () => {
      if (!alive || running || AppState.currentState !== 'active') return;
      running = true;
      try {
        const valid = await repository().validateSession();
        if (!alive || useSession.getState().session?.userId !== actor) return;
        if (!valid) {
          await clear();
          return;
        }
        if (Date.now() - lastRegistration > 300000) {
          await repository().registerDevice(deviceInfo());
          lastRegistration = Date.now();
        }
      } catch (error) {
        if (error instanceof RepositoryError && error.code === 'UNAUTHORIZED' && alive)
          await clear();
        // Network failure is not evidence of revocation. Offline state is handled separately.
      } finally {
        running = false;
      }
    };
    void check();
    const interval = setInterval(() => void check(), 30000);
    const state = AppState.addEventListener('change', (next) => {
      if (next === 'active') void check();
    });
    return () => {
      alive = false;
      clearInterval(interval);
      state.remove();
    };
  }, [actor, cache, locale]);
}
