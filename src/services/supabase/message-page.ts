import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { Message } from '@/types/domain';
import { RepositoryError } from '../repository';
import { repositoryError } from './errors';
import { decodeCursor, encodeCursor } from '@/features/chats/cursor';
type Row = Database['public']['Tables']['messages']['Row'];
export function mapMessage(row: Row): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id ?? '',
    kind: row.kind as Message['kind'],
    text: row.deleted_at ? '' : row.body,
    createdAt: row.created_at,
    clientId: row.client_id,
    replyTo: row.reply_to,
    deletedAt: row.deleted_at,
    status: 'sent',
    attachmentId: row.attachment_id,
    durationSeconds: null,
    location: null,
    contact: null,
    reactions: [],
    readBy: [],
  };
}
export async function readMessagePage(
  client: SupabaseClient<Database>,
  conversationId: string,
  cursor?: string,
) {
  const { data, error } = await client.rpc('get_messages', {
    conversation: conversationId,
    ...decodeCursor(cursor),
  });
  if (error) throw repositoryError(error);
  const items = (data ?? []).map(mapMessage);
  if (items.length) {
    const live = items.filter((m) => !m.deletedAt);
    const locationIds = live.filter((m) => m.kind === 'location').map((m) => m.id);
    const contactIds = live.filter((m) => m.kind === 'contact').map((m) => m.id);
    const attachmentIds = live.flatMap((m) => (m.attachmentId ? [m.attachmentId] : []));
    const [reactions, members, locations, contacts, attachments] = await Promise.all([
      client.rpc('get_message_reactions', { message_ids: items.map((m) => m.id) }),
      client
        .from('conversation_members')
        .select('user_id,last_read_at,last_read_message_id')
        .eq('conversation_id', conversationId)
        .is('left_at', null)
        .limit(32),
      locationIds.length
        ? client
            .from('message_locations')
            .select('message_id,latitude,longitude,label')
            .in('message_id', locationIds)
        : Promise.resolve({ data: [], error: null }),
      contactIds.length
        ? client.rpc('get_message_contacts', { message_ids: contactIds })
        : Promise.resolve({ data: [], error: null }),
      attachmentIds.length
        ? client.from('message_attachments').select('id,duration_seconds').in('id', attachmentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [locations, contacts, attachments])
      if (result.error) throw repositoryError(result.error);
    if (reactions.error) throw repositoryError(reactions.error);
    if (members.error) throw repositoryError(members.error);
    const locationById = new Map(locations.data?.map((l) => [l.message_id, l]));
    const contactById = new Map(contacts.data?.map((c) => [c.message_id, c]));
    const attachmentById = new Map(attachments.data?.map((a) => [a.id, a]));
    const reactionById = new Map(reactions.data?.map((r) => [r.message_id, r]));
    for (const m of items) {
      if (!m.deletedAt) {
        const location = locationById.get(m.id);
        m.location = location
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
              label: location.label,
            }
          : null;
        const contact = contactById.get(m.id);
        const username = contact?.username;
        m.contact =
          contact?.display_name && username ? { name: contact.display_name, username } : null;
        m.durationSeconds = attachmentById.get(m.attachmentId ?? '')?.duration_seconds ?? null;
      }
      const parsed = z
        .array(z.object({ userId: z.string().uuid(), emoji: z.string().min(1).max(16) }))
        .safeParse(reactionById.get(m.id)?.reactions ?? []);
      if (!parsed.success) throw new RepositoryError('UNAVAILABLE');
      m.reactions = parsed.data;
      m.readBy = (members.data ?? [])
        .filter(
          (r) =>
            r.user_id !== m.senderId &&
            (r.last_read_at > m.createdAt ||
              (r.last_read_at === m.createdAt && (r.last_read_message_id ?? '') >= m.id)),
        )
        .map((r) => r.user_id);
    }
  }
  const last = items.at(-1);
  return {
    items,
    nextCursor: items.length === 40 && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
