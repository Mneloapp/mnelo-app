import * as SecureStore from 'expo-secure-store';
import { chatPins } from '@/messenger/chat-pins';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
}));

test('native pin identifiers enter only device-protected account-scoped storage', async () => {
  await chatPins.toggle('native-owner', 'chat-id');
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('mnelo.chat-pins.v1.native-owner');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'mnelo.chat-pins.v1.native-owner',
    JSON.stringify({ version: 1, ids: ['chat-id'] }),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
  );
});
