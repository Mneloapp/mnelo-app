import type { LocalDatabase } from './model';

export type ExportCursor = { sentAt: number; sequence: number };
export type ExportMessage = ExportCursor & {
  sender: string;
  kind: string;
  body: string;
  editedAt: number;
  attachment: string | null;
  name: string | null;
  mime: string | null;
  replyTo: string | null;
  replySequence: number | null;
  replySender: string | null;
  replyBody: string | null;
  replyKind: string | null;
};
export async function readExportSnapshot(db: LocalDatabase, chat: string) {
  if (!(await db.all('SELECT 1 FROM chats WHERE id=?', chat)).length)
    throw new Error('CHAT_NOT_FOUND');
  return (
    await db.all<{ through: number; count: number }>(
      'SELECT COALESCE(MAX(sequence),0) AS through,COUNT(*) AS count FROM messages WHERE chat_id=?',
      chat,
    )
  )[0]!;
}
export async function readExportPage(
  db: LocalDatabase,
  chat: string,
  through: number,
  cursor?: ExportCursor,
) {
  if (
    !Number.isSafeInteger(through) ||
    through < 0 ||
    (cursor && (!Number.isSafeInteger(cursor.sequence) || !Number.isSafeInteger(cursor.sentAt)))
  )
    throw new Error('EXPORT_CURSOR_INVALID');
  if (!(await db.all('SELECT 1 FROM chats WHERE id=?', chat)).length)
    throw new Error('CHAT_NOT_FOUND');
  return db.all<ExportMessage>(
    `SELECT m.sequence,m.sent_at AS sentAt,m.sender,m.kind,m.body,m.edited_at AS editedAt,
      m.media_id AS attachment,f.name,f.mime,m.reply_to AS replyTo,
      r.sequence AS replySequence,r.sender AS replySender,substr(r.body,1,240) AS replyBody,r.kind AS replyKind
      FROM messages m LEFT JOIN media f ON f.id=m.media_id
      LEFT JOIN messages r ON r.id=m.reply_to AND r.chat_id=m.chat_id AND r.sequence<=?
      WHERE m.chat_id=? AND m.sequence<=? ${cursor ? 'AND (m.sent_at>? OR (m.sent_at=? AND m.sequence>?))' : ''}
      ORDER BY m.sent_at ASC,m.sequence ASC LIMIT 120`,
    through,
    chat,
    through,
    ...(cursor ? [cursor.sentAt, cursor.sentAt, cursor.sequence] : []),
  );
}

// Canonical metadata shared by archive validation and atomic export-and-delete.
export const exportRowBytes = (row: ExportMessage) =>
  new TextEncoder().encode(
    JSON.stringify(
      Object.keys(row)
        .sort()
        .map((key) => [key, row[key as keyof ExportMessage]]),
    ) + '\n',
  );
export type ExportProof = { owner: string; through: number; digest: string };
