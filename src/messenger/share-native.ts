export type NativeConversationSuggestions = {
  donateConversation(
    chat: string,
    title: string,
    avatar: string | null,
    outgoing: boolean,
  ): Promise<boolean>;
  forgetConversation(chat: string | null): Promise<boolean>;
};
export const conversationSuggestions: NativeConversationSuggestions | null = null;
export const resolveSharedFile: ((uri: string) => string | null) | null = null;
export const incomingFileBridge: {
  claimIncomingFiles(values: string[]): Promise<Record<string, string>>;
  discardIncomingFiles(values: string[]): Promise<void>;
} | null = null;
export function sharedConversation(_values: string[]): string | null {
  return null;
}

export const saveChatExportFile: ((uri: string) => Promise<boolean>) | null = null;
