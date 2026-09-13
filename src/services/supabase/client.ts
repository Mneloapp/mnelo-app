import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Database } from './database.types';
import { createSecureSessionStorage } from './secure-session-storage';
import { env } from '@/lib/env';
import { createBoundedFetch } from '@/lib/bounded-fetch';
import { RepositoryError } from '@/services/repository';
const memory = new Map<string, string>();
const memoryStorage = {
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: async (key: string) => {
    memory.delete(key);
  },
};
const nativeStorage = createSecureSessionStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
// Browser layout QA uses ephemeral memory. Mobile session material only enters SecureStore.
export const sessionStorage = Platform.OS === 'web' ? memoryStorage : nativeStorage;
export const sessionStorageKey =
  'mnelo.auth.' +
  env.appEnv +
  '.' +
  (env.supabaseUrl
    ? new URL(env.supabaseUrl).hostname.replace(/[^A-Za-z0-9._-]/g, '_')
    : 'unconfigured');
function initializeClient() {
  if (!env.supabaseUrl || !env.supabasePublishableKey) throw new RepositoryError('UNAVAILABLE');
  return createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      storage: sessionStorage,
      storageKey: sessionStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      debug: false,
    },
    global: { fetch: createBoundedFetch(fetch) },
    realtime: { params: { eventsPerSecond: 10 } },
  });
}
let instance: ReturnType<typeof initializeClient> | undefined;
export function supabaseClient() {
  return (instance ??= initializeClient());
}
export function setAuthForeground(active: boolean) {
  if (!env.supabaseUrl) return;
  if (active) void supabaseClient().auth.startAutoRefresh();
  else void supabaseClient().auth.stopAutoRefresh();
}
