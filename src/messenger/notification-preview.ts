import { z } from 'zod';
import { directChatId } from './crypto';
import type { DeliveryAtomic } from './delivery/journal';
import { deliveryContent } from './delivery/application';

export type NotificationPreview = {
  id: string;
  chat: string;
  sender: string;
  phone: string;
  name: string;
  kind: string;
  body: string;
  mime: string;
};

export function notificationText(
  preview: Pick<NotificationPreview, 'kind' | 'body' | 'mime'>,
  language = 'en',
) {
  if (preview.kind === 'text')
    return Array.from(preview.body.replace(/\s+/g, ' ').trim()).slice(0, 240).join('');
  const kind = preview.mime.startsWith('video/') ? 'video' : preview.kind;
  const labels: Record<string, [string, string]> = {
    image: ['Photo', 'ფოტო'],
    video: ['Video', 'ვიდეო'],
    voice: ['Voice message', 'ხმოვანი შეტყობინება'],
    file: ['File', 'ფაილი'],
    contact: ['Contact', 'კონტაქტი'],
    location: ['Location', 'მდებარეობა'],
  };
  return (labels[kind] ?? ['New message', 'ახალი შეტყობინება'])[language.startsWith('ka') ? 1 : 0];
}

// The event ID is only a lookup hint. Membership, author, phone binding, local
// deletion and blocks are checked against the encrypted vault before a preview
// is allowed. A push cannot supply its own title, text, sender or destination.
export async function readNotificationPreview(
  atomic: DeliveryAtomic,
  own: string,
  id: string,
  incoming?: { sender: string; body: string },
): Promise<NotificationPreview | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  let parsed: ReturnType<typeof deliveryContent.safeParse> | null = null;
  try {
    parsed = incoming ? deliveryContent.safeParse(JSON.parse(incoming.body)) : null;
  } catch {
    return null;
  }
  return atomic(async (db) => {
    if ((await db.all('SELECT id FROM forgotten_messages WHERE id=?', id)).length) return null;
    const stored = (
      await db.all<{
        sender: string;
        chat_id: string;
        kind: string;
        body: string;
        mime: string | null;
      }>(
        'SELECT m.sender,m.chat_id,m.kind,m.body,f.mime FROM messages m LEFT JOIN media f ON f.id=m.media_id WHERE m.id=?',
        id,
      )
    )[0];
    if (stored?.kind === 'deleted' || stored?.sender === own) return null;
    const value = parsed?.success ? parsed.data : null;
    const packet = value?.packet.type === 'message' && value.packet.id === id ? value.packet : null;
    if (!stored && (!packet || !incoming)) return null;
    const sender = stored?.sender ?? incoming!.sender;
    if (sender === own || (stored && incoming && stored.sender !== incoming.sender)) return null;
    const contact = (
      await db.all<{ name: string; blocked: number; phone: string | null }>(
        'SELECT c.name,c.blocked,n.phone FROM contacts c LEFT JOIN contact_numbers n ON n.public_key=c.public_key WHERE c.public_key=?',
        sender,
      )
    )[0];
    if (
      !contact ||
      contact.blocked ||
      (!stored && (!contact.phone || contact.phone !== value?.phone))
    )
      return null;
    const chat = stored?.chat_id ?? packet!.chat;
    if (chat !== directChatId(own, sender)) {
      const group = (
        await db.all<{ left_group: number }>(
          "SELECT left_group FROM chats WHERE id=? AND kind='group'",
          chat,
        )
      )[0];
      const members = await db.all<{ public_key: string }>(
        'SELECT public_key FROM members WHERE chat_id=?',
        chat,
      );
      if (
        !group ||
        group.left_group ||
        !members.some((row) => row.public_key === own) ||
        !members.some((row) => row.public_key === sender)
      )
        return null;
    }
    const change = (
      await db.all<{ action: string; body: string }>(
        'SELECT action,body FROM message_changes WHERE message_id=? AND peer=? AND chat=?',
        id,
        sender,
        chat,
      )
    )[0];
    if (change?.action === 'delete') return null;
    return {
      id,
      chat,
      sender,
      phone: contact.phone ?? '',
      name: contact.name,
      kind: stored?.kind ?? packet!.kind,
      body: change?.action === 'edit' ? change.body : (stored?.body ?? packet!.body),
      mime: stored?.mime ?? value?.attachment?.mime ?? '',
    };
  });
}

export async function availableNotificationPreview(
  atomic: DeliveryAtomic,
  own: string,
  id: string,
) {
  const stored = await readNotificationPreview(atomic, own, id);
  if (stored) return stored;
  const rows = await atomic(async (db) => {
    if (
      !(await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='signal_inbox'"))
        .length
    )
      return [];
    return db.all<{ sender: string; body: string }>(
      'SELECT sender,body FROM signal_inbox WHERE applied=0 ORDER BY created_at DESC LIMIT 40',
    );
  });
  for (const row of rows) {
    const preview = await readNotificationPreview(atomic, own, id, row);
    if (preview) return preview;
  }
  return null;
}
