import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { useAppActive } from '@/hooks/useAppActive';
import type { DeviceMessenger } from './engine';

// A mounted screen is not necessarily visible: tab screens and back-stack chats stay mounted.
export function useVisibleRead(
  engine: DeviceMessenger,
  chat: string | null,
  through: number | undefined,
) {
  const focused = useIsFocused();
  const active = useAppActive();
  useEffect(() => {
    if (!focused || !active || through === undefined) return;
    void (chat === null ? engine.markCallsSeen(through) : engine.markRead(chat, through)).catch(
      () => undefined,
    );
  }, [engine, chat, through, focused, active]);
}
