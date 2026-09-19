import type { LocalDatabase, LocalMessage } from './model';

export type MessageRecipientInfo = {
  peer: string;
  name: string;
  status: 'pending' | 'delivered' | 'read';
  // Local observation of authenticated receipts, not the remote device's clock.
  // Existing history and a read received before its ACK may have no delivery time.
  deliveredAt: number | null;
  readAt: number | null;
};
export type MessageInfo = {
  message: LocalMessage;
  kind: 'direct' | 'group';
  recipients: MessageRecipientInfo[];
};

export async function readMessageInfo(
  db: LocalDatabase,
  owner: string,
  chat: string,
  id: string,
): Promise<MessageInfo | null> {
  const row = (
    await db.all<{
      id: string;
      chat_id: string;
      sender: string;
      kind: string;
      body: string;
      sent_at: number;
      received_at: number;
      reply_to: string | null;
      media_id: string | null;
      edited_at: number;
      sequence: number;
      chatKind: 'direct' | 'group';
    }>(
      `SELECT m.*,c.kind AS chatKind FROM messages m JOIN chats c ON c.id=m.chat_id
     WHERE m.id=? AND m.chat_id=? AND m.sender=? AND m.kind!='call'`,
      id,
      chat,
      owner,
    )
  )[0];
  if (!row) return null;
  // A separate observation snapshot retains recipients after delivery work is removed.
  // Current membership must neither hide a former recipient nor add a new one.
  const recipients = (
    await db.all<{
      peer: string;
      name: string;
      acknowledged: number;
      readAt: number | null;
      deliveredAt: number | null;
    }>(
      `WITH audience AS (
        SELECT peer FROM deliveries WHERE message_id=?
        UNION SELECT peer FROM message_receipt_info WHERE message_id=?
      ) SELECT a.peer,COALESCE(c.name,n.phone,'') AS name,
        MAX(COALESCE(d.acknowledged,0),COALESCE(r.acknowledged,0)) AS acknowledged,
        COALESCE(r.read_at,d.read_at) AS readAt,r.delivered_at AS deliveredAt
      FROM audience a LEFT JOIN deliveries d ON d.message_id=? AND d.peer=a.peer
      LEFT JOIN message_receipt_info r ON r.message_id=? AND r.peer=a.peer
      LEFT JOIN contacts c ON c.public_key=a.peer LEFT JOIN contact_numbers n ON n.public_key=a.peer
      ORDER BY a.peer`,
      id,
      id,
      id,
      id,
    )
  ).map(({ acknowledged, ...recipient }): MessageRecipientInfo => ({
    ...recipient,
    status: recipient.readAt !== null ? 'read' : acknowledged ? 'delivered' : 'pending',
  }));
  return {
    kind: row.chatKind,
    message: {
      id: row.id,
      chatId: row.chat_id,
      sender: row.sender,
      kind: row.kind,
      body: row.body,
      sentAt: row.sent_at,
      receivedAt: row.received_at,
      replyTo: row.reply_to,
      attachment: row.media_id,
      sequence: row.sequence,
      ...(row.edited_at ? { editedAt: row.edited_at } : {}),
      status:
        recipients.length && recipients.every((recipient) => recipient.status === 'read')
          ? 'read'
          : recipients.length && recipients.every((recipient) => recipient.status !== 'pending')
            ? 'delivered'
            : 'pending',
    },
    recipients,
  };
}

// Snapshot facts before deleting obsolete transport work after membership changes.
// Never backfill a receipt timestamp from the send time or from migration time.
export async function snapshotMessageRecipients(
  db: LocalDatabase,
  scope: 'message' | 'chat',
  id: string,
) {
  await db.run(
    `INSERT INTO message_receipt_info(message_id,peer,acknowledged,delivered_at,read_at)
     SELECT d.message_id,d.peer,d.acknowledged,NULL,d.read_at FROM deliveries d
     JOIN messages m ON m.id=d.message_id WHERE ${scope === 'message' ? 'm.id' : 'm.chat_id'}=?
     ON CONFLICT(message_id,peer) DO UPDATE SET
       acknowledged=MAX(acknowledged,excluded.acknowledged),read_at=COALESCE(read_at,excluded.read_at)`,
    id,
  );
}
// Called inside the authenticated application receive transaction. Duplicate or
// late ACKs after a read cannot invent a historical delivery timestamp.
export async function observeMessageDelivery(
  db: LocalDatabase,
  owner: string,
  peer: string,
  id: string,
  now: number,
) {
  await snapshotMessageRecipients(db, 'message', id);
  await db.run(
    `UPDATE message_receipt_info SET delivered_at=CASE WHEN acknowledged=0 THEN COALESCE(delivered_at,?) ELSE delivered_at END,acknowledged=1
     WHERE message_id=? AND peer=? AND message_id IN (SELECT id FROM messages WHERE sender=?)`,
    now,
    id,
    peer,
    owner,
  );
}
export async function observeMessageRead(
  db: LocalDatabase,
  owner: string,
  peer: string,
  id: string,
  now: number,
) {
  await snapshotMessageRecipients(db, 'message', id);
  await db.run(
    `UPDATE message_receipt_info SET acknowledged=1,read_at=COALESCE(read_at,?)
     WHERE message_id=? AND peer=? AND message_id IN (SELECT id FROM messages WHERE sender=?)`,
    now,
    id,
    peer,
    owner,
  );
}
