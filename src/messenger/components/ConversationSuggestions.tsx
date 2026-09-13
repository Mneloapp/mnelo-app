import { useEffect } from 'react';
import { useDevice } from '../DeviceProvider';
import { conversationSuggestions } from '../share-native';
import { observeConversationSuggestions } from '../conversation-suggestions';
export function ConversationSuggestions() {
  const { engine, view } = useDevice();
  useEffect(() => {
    if (!conversationSuggestions) return;
    return observeConversationSuggestions(engine, view, conversationSuggestions);
  }, [engine, view]);
  return null;
}
