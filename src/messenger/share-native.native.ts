import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeConversationSuggestions } from './share-native';
type ShareBridge = NativeConversationSuggestions & {
  resolveIncomingFile(uri: string): string | null;
  sharedConversation(values: string[]): string | null;
};
const native =
  Platform.OS === 'ios' ? requireOptionalNativeModule<ShareBridge>('MneloShare') : null;
export const conversationSuggestions: NativeConversationSuggestions | null = native;
export const resolveSharedFile = native ? (uri: string) => native.resolveIncomingFile(uri) : null;
export function sharedConversation(values: string[]): string | null {
  try {
    return native?.sharedConversation(values) ?? null;
  } catch {
    return null;
  }
}
