import { useEffect, useRef, useState } from 'react';
import type { FlatList } from 'react-native';
import type { LocalMessage } from './model';
import type { ChatTimelineRow } from './photo-albums';

/** Jump only after a local send is committed and included in the rendered page. */
export function useSentMessageScroll(chatId: string, rows: readonly LocalMessage[]) {
  const listRef = useRef<FlatList<ChatTimelineRow>>(null);
  const [sent, setSent] = useState<{ chatId: string; id: string } | null>(null);
  const ready = sent?.chatId === chatId && rows.some((message) => message.id === sent.id);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      setSent(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, sent]);
  return { listRef, sent: (id: string) => setSent({ chatId, id }) };
}
