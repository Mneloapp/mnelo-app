import * as Crypto from 'expo-crypto';
import { useRef } from 'react';
import { RepositoryError } from '@/services/repository';
import { messageOutbox } from '@/services/message-outbox';
import { useSession } from '@/stores/session';
import { usePendingMessages } from './pending-messages';
import type { Message } from '@/types/domain';
export function useSendMessage(conversationId: string) {
  const draft = useRef<Message | null>(null);
  return {
    async send(text: string, replyTo?: string) {
      const user = useSession.getState().session?.userId;
      if (!user) throw new RepositoryError('UNAUTHORIZED');
      if (!usePendingMessages.getState().ready) throw new RepositoryError('UNAVAILABLE');
      if (
        !draft.current ||
        draft.current.text !== text.trim() ||
        draft.current.replyTo !== (replyTo ?? null) ||
        draft.current.conversationId !== conversationId ||
        draft.current.senderId !== user
      ) {
        const id = Crypto.randomUUID();
        draft.current = {
          id,
          clientId: id,
          conversationId,
          senderId: user,
          kind: 'text',
          text: text.trim(),
          createdAt: new Date().toISOString(),
          replyTo: replyTo ?? null,
          deletedAt: null,
          status: 'pending',
          attachmentId: null,
          durationSeconds: null,
          location: null,
          contact: null,
          reactions: [],
        };
      }
      await messageOutbox.enqueue(draft.current);
      draft.current = null;
    },
    retry: (message: Message) => messageOutbox.retry(message.clientId),
    discard: (message: Message) => messageOutbox.discard(message.clientId),
  };
}
