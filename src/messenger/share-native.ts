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
export function sharedConversation(_values: string[]): string | null {
  return null;
}
