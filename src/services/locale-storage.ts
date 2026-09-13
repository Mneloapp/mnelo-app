import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { LocaleStorage } from '@/stores/preferences-core';
const key = 'mnelo.preferences.locale';
// Only an en/ka preference. Browser auth remains memory-only; no private data enters localStorage.
export const localeStorage: LocaleStorage = {
  async get() {
    if (Platform.OS === 'web')
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(locale) {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') throw new Error('LOCALE_STORAGE_UNAVAILABLE');
      window.localStorage.setItem(key, locale);
    } else await SecureStore.setItemAsync(key, locale);
  },
};
