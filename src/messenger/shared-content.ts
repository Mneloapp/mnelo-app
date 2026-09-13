import type { LocalDatabase } from './model';

export type ContentTab = 'media' | 'links' | 'docs';
export type SharedItem = {
  id: string;
  sequence: number;
  sentAt: number;
  body: string;
  attachment: string | null;
  name: string | null;
  mime: string | null;
  duration: number | null;
  url?: string;
};
export type SharedPage = { items: SharedItem[]; next: number | undefined };

// Never fetch previews or follow a link while indexing a private conversation.
export function messageLinks(body: string): string[] {
  const found = body.match(/https?:\/\/[^\s<>"\u0000-\u001f]+/giu) ?? [];
  return [
    ...new Set(
      found.flatMap((candidate) => {
        const trimmed = candidate.replace(/[.,!?;:'\u2019\u201d]+$/u, '');
        let value = trimmed;
        for (const [open, close] of [
          ['(', ')'],
          ['[', ']'],
          ['{', '}'],
        ]) {
          while (value.endsWith(close!) && value.split(close!).length > value.split(open!).length)
            value = value.slice(0, -1);
        }
        try {
          const url = new URL(value);
          return ['http:', 'https:'].includes(url.protocol) &&
            url.hostname &&
            !url.username &&
            !url.password
            ? [url.href]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

const visual = "(f.mime LIKE 'image/%' OR f.mime LIKE 'video/%')";
const filters: Record<ContentTab, string> = {
  media: `m.kind IN ('image','file') AND ${visual}`,
  docs: `m.kind='file' AND NOT ${visual}`,
  links: "m.kind='text' AND (m.body LIKE '%https://%' OR m.body LIKE '%http://%')",
};

export async function readSharedContent(
  db: LocalDatabase,
  chat: string,
  tab: ContentTab,
  before: number,
): Promise<SharedPage> {
  if (!Object.hasOwn(filters, tab)) throw new Error('CONTENT_TAB_INVALID');
  // Metadata only; attachment bytes are loaded for visible cells or an explicit open.
  const rows = await db.all<SharedItem>(
    `SELECT m.id,m.sequence,m.sent_at AS sentAt,m.body,m.media_id AS attachment,
      f.name,f.mime,f.duration FROM messages m LEFT JOIN media f ON f.id=m.media_id
      WHERE m.chat_id=? AND m.sequence<? AND (${filters[tab]})
      ORDER BY m.sequence DESC LIMIT 40`,
    chat,
    before,
  );
  return {
    items:
      tab === 'links'
        ? rows.flatMap((row) => messageLinks(row.body).map((url) => ({ ...row, url })))
        : rows,
    // Advance over raw candidates even when a page contains only malformed URLs.
    next: rows.length === 40 ? rows.at(-1)?.sequence : undefined,
  };
}
