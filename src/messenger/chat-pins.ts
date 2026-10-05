import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createChatPins } from './chat-pins-core';

// Browser previews keep private preferences in memory, just like browser auth.
// Device-only Keychain/Keystore records are scoped to the authenticated identity.
const browserPins = new Map<string, string>();
const storageKey = (owner: string) => `mnelo.chat-pins.v1.${owner}`;
export const chatPins = createChatPins({
  read: (owner) =>
    Platform.OS === 'web'
      ? Promise.resolve(browserPins.get(owner) ?? null)
      : SecureStore.getItemAsync(storageKey(owner)),
  async write(owner, value) {
    if (Platform.OS === 'web') browserPins.set(owner, value);
    else
      await SecureStore.setItemAsync(storageKey(owner), value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
  },
});

export function useChatPins(owner: string | undefined) {
  const pins = useSyncExternalStore(
    chatPins.subscribe,
    () => chatPins.snapshot(owner),
    () => chatPins.snapshot(undefined),
  );
  useEffect(() => {
    if (owner) void chatPins.restore(owner);
  }, [owner]);
  return pins;
}
