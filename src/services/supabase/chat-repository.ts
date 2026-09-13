import { mapMessage, readMessagePage } from './message-page';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseClient } from './client';
import type { Database } from './database.types';
import { repositoryError } from './errors';
import { RepositoryError, type MneloRepository } from '../repository';
import type { Conversation } from '@/types/domain';
import { decodeCursor } from '@/features/chats/cursor';
export { mapMessage } from './message-page';
function subscribeStatus(
  channel: RealtimeChannel,
  listener: () => void,
  status?: (ready: boolean) => void,
) {
  // A WebSocket join can precede PostgreSQL subscription registration.
  channel.on('system', {}, (payload) => {
    if (payload.extension !== 'postgres_changes') return;
    status?.(payload.status === 'ok');
    if (payload.status === 'ok') listener();
  });
  channel.subscribe((value) => {
    if (value !== 'SUBSCRIBED') status?.(false);
    // Snapshot at join, then again when the database stream is ready: no join-gap loss.
    if (value === 'SUBSCRIBED') listener();
  });
  return () => {
    void supabaseClient().removeChannel(channel);
  };
}
function mapConversation(
  c: Database['public']['Functions']['list_conversations']['Returns'][number],
): Conversation {
  return {
    id: c.id,
    kind: c.kind as Conversation['kind'],
    title: c.title,
    memberIds: c.member_ids,
    preview: c.preview,
    previewKind: c.last_message_kind as Exclude<Conversation['previewKind'], undefined>,
    updatedAt: c.updated_at,
    unreadCount: c.unread_count,
  };
}
export function chatRepository(): Pick<
  MneloRepository,
  | 'conversation'
  | 'conversations'
  | 'messages'
  | 'sendMessage'
  | 'react'
  | 'deleteMessage'
  | 'markRead'
  | 'subscribe'
  | 'subscribeInbox'
> {
  const client = supabaseClient();
  return {
    async conversation(id) {
      const { data, error } = await client.rpc('get_conversation', { conversation: id });
      if (error) throw repositoryError(error);
      if (!data?.[0]) throw new RepositoryError('FORBIDDEN');
      return mapConversation(data[0]);
    },
    async conversations(cursor) {
      const { data, error } = await client.rpc('list_conversations', decodeCursor(cursor));
      if (error) throw repositoryError(error);
      return (data ?? []).map(mapConversation);
    },
    messages: (conversationId, cursor) => readMessagePage(client, conversationId, cursor),
    async sendMessage(input) {
      const { data, error } = await client.rpc('send_text_message', {
        conversation: input.conversationId,
        text_body: input.text,
        client_id: input.clientId,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      });
      if (error) throw repositoryError(error);
      if (!data) throw new RepositoryError('UNAVAILABLE');
      return mapMessage(data);
    },
    async react(id, emoji) {
      const { error } = await client.rpc('toggle_message_reaction', { message: id, emoji });
      if (error) throw repositoryError(error);
    },
    async deleteMessage(id) {
      const { error } = await client.rpc('delete_own_message', { message: id });
      if (error) throw repositoryError(error);
    },
    async markRead(id, throughMessage) {
      if (!throughMessage) return;
      const { error } = await client.rpc('mark_conversation_read', {
        conversation: id,
        through_message: throughMessage,
      });
      if (error) throw repositoryError(error);
    },
    subscribe(id, listener, status) {
      const channel = client.channel('conversation:' + id, { config: { private: true } });
      for (const table of ['messages', 'message_reactions', 'conversation_members'] as const) {
        for (const event of ['INSERT', 'UPDATE'] as const)
          channel.on(
            'postgres_changes',
            { event, schema: 'public', table, filter: 'conversation_id=eq.' + id },
            listener,
          );
      }
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: 'id=eq.' + id },
        listener,
      );
      return subscribeStatus(channel, listener, status);
    },
    subscribeInbox(userId, listener) {
      const channel = client.channel('inbox:' + userId, { config: { private: true } });
      for (const table of ['messages', 'conversations', 'conversation_members'] as const)
        for (const event of ['INSERT', 'UPDATE'] as const)
          channel.on('postgres_changes', { event, schema: 'public', table }, () =>
            listener('conversation'),
          );
      for (const table of ['connection_requests', 'connections', 'connection_completions'] as const)
        for (const event of ['INSERT', 'UPDATE'] as const)
          channel.on('postgres_changes', { event, schema: 'public', table }, () =>
            listener('request'),
          );
      for (const event of ['INSERT', 'UPDATE'] as const)
        channel.on(
          'postgres_changes',
          { event, schema: 'public', table: 'user_access_state', filter: 'user_id=eq.' + userId },
          () => listener('access'),
        );
      return subscribeStatus(channel, listener);
    },
  };
}
