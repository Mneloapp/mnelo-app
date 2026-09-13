import { shouldRetryQuery } from '../src/lib/query-client';
import { RepositoryError } from '../src/services/repository';
import { usePendingMessages } from '../src/features/chats/pending-messages';
import type { Message } from '../src/types/domain';
it('does not retry rejected repository authorization or rate limits', () => {
  for (const code of ['UNAUTHORIZED', 'FORBIDDEN', 'RATE_LIMITED'] as const)
    expect(shouldRetryQuery(0, new RepositoryError(code))).toBe(false);
});
it('reconciles pending updates by stable id and clears message data on logout', () => {
  const m: Message = {
    id: 'one',
    clientId: 'one',
    conversationId: 'chat',
    senderId: 'self',
    kind: 'text',
    text: 'Private development text',
    createdAt: '2026-09-07T00:00:00Z',
    replyTo: null,
    deletedAt: null,
    status: 'pending',
    attachmentId: null,
    durationSeconds: null,
    location: null,
    contact: null,
    reactions: [],
  };
  const store = usePendingMessages.getState();
  store.clear();
  store.put(m);
  store.put({ ...m, status: 'failed' });
  expect(usePendingMessages.getState().items).toHaveLength(1);
  expect(usePendingMessages.getState().items[0]?.clientId).toBe('one');
  store.clear();
  expect(usePendingMessages.getState().items).toEqual([]);
});
