import { createContext, useContext } from 'react';
import { router, type Href } from 'expo-router';

export function composerNavigation(origin: 'chats' | 'calls' | 'me') {
  const tab = `/(tabs)/${origin}` as const;
  return {
    origin,
    close: () => router.dismissTo(tab),
    returnToPicker: () => router.dismissTo(origin === 'calls' ? '/new-call' : '/new-message'),
    finish: (destination: Href) => {
      router.dismissTo(tab);
      router.push(destination);
    },
  };
}
export const ComposerContext = createContext(composerNavigation('chats'));
export const useComposer = () => useContext(ComposerContext);
