import { create } from 'zustand';
import type { Message } from '@/types/domain';
// Acknowledgments bridge the next server snapshot; they are never a second history cache.
function bounded(items: Message[]) {
  let sent = 0;
  return items.filter((m) => m.status !== 'sent' || ++sent <= 40);
}
// UI projection only. Sensitive pending text is persisted through MessageOutbox/SecureStore.
export const usePendingMessages = create<{
  items: Message[];
  put: (message: Message) => void;
  remove: (id: string) => void;
  clear: () => void;
  ready: boolean;
  storageFailed: boolean;
  sync: (messages: Message[]) => void;
}>((set) => ({
  items: [],
  ready: false,
  storageFailed: false,
  sync: (messages) =>
    set((s) => ({
      items: bounded(
        [
          ...messages,
          ...s.items.filter(
            (m) => m.status === 'sent' && !messages.some((q) => q.clientId === m.clientId),
          ),
        ].sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.clientId.localeCompare(a.clientId),
        ),
      ),
    })),
  put: (message) =>
    set((s) => ({
      items: bounded([message, ...s.items.filter((m) => m.clientId !== message.clientId)]),
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((m) => m.id !== id) })),
  clear: () => set({ items: [], ready: false, storageFailed: false }),
}));
