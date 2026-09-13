import type { LocalDatabase, Packet } from './model';
export type MessageChange = Extract<Packet, { type: 'message_change' }>;
type ChangeRow = {
  message_id: string;
  peer: string;
  chat: string;
  revision: number;
  action: 'edit' | 'delete';
  body: string;
  changed_at: number;
};

// Invoked inside the engine's serialized transaction. The authenticated sender,
// not a packet-provided identity, is the only person allowed to change a message.
export async function receiveMessageChange(
  db: LocalDatabase,
  own: string,
  peer: string,
  change: MessageChange,
) {
  if (
    (change.action === 'edit' && !change.body.trim()) ||
    (change.action === 'delete' && change.body !== '')
  )
    throw new Error('MESSAGE_CHANGE_INVALID');
  const row = (
    await db.all<{ sender: string; chat_id: string; kind: string }>(
      'SELECT sender,chat_id,kind FROM messages WHERE id=?',
      change.id,
    )
  )[0];
  if (row && (row.sender !== peer || row.chat_id !== change.chat || row.kind === 'call'))
    throw new Error('MESSAGE_CHANGE_FORBIDDEN');
  const forgotten = (
    await db.all<{ peer: string }>('SELECT peer FROM forgotten_messages WHERE id=?', change.id)
  )[0];
  if (forgotten) {
    if (forgotten.peer !== peer) throw new Error('MESSAGE_CHANGE_FORBIDDEN');
    return;
  }
  if (!row) {
    const members = await db.all<{ public_key: string }>(
      'SELECT public_key FROM members WHERE chat_id=?',
      change.chat,
    );
    if (
      !members.some((member) => member.public_key === own) ||
      !members.some((member) => member.public_key === peer)
    )
      throw new Error('MESSAGE_CHANGE_FORBIDDEN');
    const count = (
      await db.all<{ count: number }>(
        'SELECT COUNT(*) AS count FROM message_changes c WHERE NOT EXISTS(SELECT 1 FROM messages m WHERE m.id=c.message_id AND m.sender=c.peer)',
      )
    )[0]!.count;
    if (
      count >= 1000 &&
      !(
        await db.all('SELECT 1 FROM message_changes WHERE message_id=? AND peer=?', change.id, peer)
      ).length
    )
      throw new Error('MESSAGE_CHANGE_CAPACITY');
  }
  if (change.action === 'edit' && row && !['text', 'deleted'].includes(row.kind))
    throw new Error('MESSAGE_CHANGE_FORBIDDEN');
  const previous = (
    await db.all<ChangeRow>(
      'SELECT * FROM message_changes WHERE message_id=? AND peer=?',
      change.id,
      peer,
    )
  )[0];
  if (previous && previous.chat !== change.chat) throw new Error('MESSAGE_CHANGE_FORBIDDEN');
  if (previous?.action === 'delete' || (previous && previous.revision >= change.revision)) return;
  await db.run(
    'INSERT INTO message_changes VALUES(?,?,?,?,?,?,?) ON CONFLICT(message_id,peer) DO UPDATE SET revision=excluded.revision,action=excluded.action,body=excluded.body,changed_at=excluded.changed_at',
    change.id,
    peer,
    change.chat,
    change.revision,
    change.action,
    change.body,
    change.changedAt,
  );
  await applyMessageChange(db, peer, change.id, change.chat);
}
export async function applyMessageChange(
  db: LocalDatabase,
  peer: string,
  id: string,
  chat: string,
) {
  const change = (
    await db.all<ChangeRow>(
      'SELECT * FROM message_changes WHERE message_id=? AND peer=? AND chat=?',
      id,
      peer,
      chat,
    )
  )[0];
  if (!change) return;
  if (change.action === 'edit') {
    await db.run(
      "UPDATE messages SET body=?,edited_at=? WHERE id=? AND sender=? AND chat_id=? AND kind='text'",
      change.body,
      change.changed_at,
      id,
      peer,
      chat,
    );
    return;
  }
  const row = (
    await db.all<{ media_id: string | null }>(
      'SELECT media_id FROM messages WHERE id=? AND sender=? AND chat_id=?',
      id,
      peer,
      chat,
    )
  )[0];
  if (!row) return;
  await db.run(
    "UPDATE messages SET kind='deleted',body='',media_id=NULL,reply_to=NULL,edited_at=0,is_read=1 WHERE id=?",
    id,
  );
  await db.run('DELETE FROM reactions WHERE message_id=?', id);
  await db.run('DELETE FROM reaction_versions WHERE message_id=?', id);
  await db.run('DELETE FROM deliveries WHERE message_id=?', id);
  if (row.media_id) await db.run('DELETE FROM media WHERE id=?', row.media_id);
}
