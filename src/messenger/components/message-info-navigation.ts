import { createContext, useContext } from 'react';
import type { LocalMessage } from '../model';

export type MessageInfoNavigation = {
  open: (message: LocalMessage) => void;
  begin: (message: LocalMessage) => boolean;
  move: (dx: number) => void;
  end: (dx: number, velocity: number, cancelled?: boolean) => void;
};
export const MessageInfoNavigationContext = createContext<MessageInfoNavigation | null>(null);
export const useMessageInfoNavigation = () => useContext(MessageInfoNavigationContext);
