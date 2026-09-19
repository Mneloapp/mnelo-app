import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeConversationSuggestions } from './share-native';
type ShareBridge = NativeConversationSuggestions & {
  saveChatExport(uri: string): Promise<boolean>;
  resolveIncomingFile(uri: string): string | null;
  sharedConversation(values: string[]): string | null;
  claimIncomingFiles(values: string[]): Promise<Record<string, string>>;
  discardIncomingFiles(values: string[]): Promise<void>;
};
const native =
  Platform.OS === 'ios' ? requireOptionalNativeModule<ShareBridge>('MneloShare') : null;
export const conversationSuggestions: NativeConversationSuggestions | null = native;
export const incomingFileBridge = native?.claimIncomingFiles ? native : null;
export const resolveSharedFile = native ? (uri: string) => native.resolveIncomingFile(uri) : null;
export function sharedConversation(values: string[]): string | null {
  try {
    return native?.sharedConversation(values) ?? null;
  } catch {
    return null;
  }
}

export const saveChatExportFile: ((uri: string) => Promise<boolean>) | null = native?.saveChatExport
  ? (uri) => native.saveChatExport(uri)
  : null;
