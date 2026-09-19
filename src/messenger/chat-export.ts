import type { DeviceMessenger } from './engine';
import type { ContactView } from './contact-view';
import type { Contact, Media } from './model';
import { exportRowBytes, type ExportCursor, type ExportMessage } from './chat-export-source';
import { ExportZip } from './export-zip';
import { messageLinks } from './shared-content';
import { readCallRecord } from './call-record';
import { sharedContactText } from './contact-share';
import { readRichMedia, richMime } from './rich-message';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const encoder = new TextEncoder();
export const escapeExportHTML = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]!,
  );
const textBytes = (text: string) => encoder.encode(text);
const safeName = (value: string | null | undefined) =>
  (value ?? '')
    .replace(/\b[a-f0-9]{64}\b/gi, '')
    .replace(/mnelo1:[^\s]*/gi, '')
    .trim();
const stamp = (time: number) => {
  const date = new Date(time);
  return Number.isFinite(date.valueOf())
    ? date.toISOString().replace('T', ' ').replace('.000Z', ' UTC')
    : 'Unknown time';
};
const basename = (name: string) => {
  const clean = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, '_')
    .replace(/^[.\s]+|[.\s]+$/gu, '');
  // Truncate by Unicode code point so filenames remain valid UTF-8.
  let result = '';
  for (const char of clean) {
    if (encoder.encode(result + char).length > 160) break;
    result += char;
  }
  return result || 'attachment';
};
export function exportAttachmentPath(row: Pick<ExportMessage, 'sequence' | 'mime' | 'name'>) {
  if (!Number.isSafeInteger(row.sequence) || row.sequence < 1)
    throw new Error('EXPORT_PATH_INVALID');
  const media = /^(image|video|audio)\//.test(row.mime ?? '');
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/3gpp': '3gp',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  };
  const extension = extensions[row.mime ?? ''];
  if (media && extension) {
    const label = row.mime!.startsWith('image/')
      ? 'Photo'
      : row.mime!.startsWith('video/')
        ? 'Video'
        : 'Audio';
    return `Media/${label}-${String(row.sequence).padStart(6, '0')}.${extension}`;
  }
  return `${media ? 'Media' : 'Documents'}/${row.sequence}-${basename(row.name ?? 'attachment')}`;
}
const relativeURL = (path: string) => path.split('/').map(encodeURIComponent).join('/');
function header(title: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' file:; media-src 'self' file:; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeExportHTML(title)}</title><style>body{margin:0;background:#f4f5f1;color:#20241f;font:16px/1.55 system-ui,sans-serif}main{max-width:860px;margin:auto;padding:24px}h1{overflow-wrap:anywhere}article{margin:16px 0;padding:16px;background:white;border-radius:16px;overflow-wrap:anywhere}p{white-space:pre-wrap;margin:8px 0}.meta,small{color:#626960}a{color:#275f3b}blockquote{border-left:3px solid #8ca776;margin:12px 0;padding:4px 12px;background:#f4f5f1}img,video{display:block;max-width:100%;max-height:600px;margin:12px 0}audio{max-width:100%}.missing{color:#8a3d21}li{overflow-wrap:anywhere}</style></head><body><main><h1>${escapeExportHTML(title)}</h1>`;
}
const footer = '</main></body></html>';
function plainMessage(row: Pick<ExportMessage, 'kind' | 'body'>, contacts: readonly Contact[]) {
  if (row.kind === 'deleted') return 'This message was deleted.';
  if (row.kind === 'call') {
    const call = readCallRecord(row.body);
    return `${call.media === 'video' ? 'Video call' : 'Voice call'} · ${call.direction} · ${call.status}`;
  }
  if (row.kind === 'contact')
    return `Contact\n${sharedContactText(row.body, contacts) || 'Contact details unavailable'}`;
  if (row.kind === 'location') return `Location\n${row.body}`;
  const label: Record<string, string> = {
    image: 'Photo',
    voice: 'Voice message',
    file: 'Attachment',
  };
  return label[row.kind] ? `${label[row.kind]}${row.body ? '\n' + row.body : ''}` : row.body;
}
function richText(media: Media | null) {
  const card = readRichMedia(media);
  if (!card) return 'Interactive attachment unavailable.';
  if (card.type === 'poll')
    return `Poll: ${card.question}\n${card.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}\n${card.multiple ? 'Multiple answers allowed' : 'One answer allowed'}`;
  return `Event: ${card.title}\nStarts: ${stamp(card.start)}\nEnds: ${stamp(card.end)}${card.location ? '\nLocation: ' + card.location : ''}${card.notes ? '\n' + card.notes : ''}`;
}
async function* base64Chunks(base64: string) {
  // 64 KiB of base64 produces 48 KiB binary; never decode the entire attachment.
  for (let offset = 0; offset < base64.length; offset += 65536)
    yield Uint8Array.from(atob(base64.slice(offset, offset + 65536)), (char) => char.charCodeAt(0));
}

export type ChatExportOptions = {
  write: (bytes: Uint8Array) => Promise<void> | void;
  checkCancelled?: () => void;
  onProgress?: (count: number) => void;
  generatedAt?: number;
};
export async function createChatExport(
  engine: DeviceMessenger,
  view: Pick<ContactView, 'contacts' | 'chat' | 'members'>,
  chatId: string,
  options: ChatExportOptions,
) {
  const account = engine.currentIdentity();
  if (!account) throw new Error('IDENTITY_REQUIRED');
  const check = () => {
    options.checkCancelled?.();
    if (engine.currentIdentity()?.key !== account.key) throw new Error('IDENTITY_CHANGED');
  };
  check();
  const [snapshot, chat, contacts, members] = await Promise.all([
    engine.exportSnapshot(chatId),
    view.chat(chatId),
    view.contacts(),
    view.members(chatId),
  ]);
  check();
  if (!chat) throw new Error('CHAT_NOT_FOUND');
  const names = new Map(
    contacts.map((contact) => [
      contact.key,
      safeName(contact.name) || contact.phone || 'Unknown contact',
    ]),
  );
  for (const member of members)
    if (!names.has(member.key)) names.set(member.key, safeName(member.name) || 'Unknown contact');
  names.set(account.key, `${safeName(account.name) || 'Me'} (me)`);
  const name = (key: string) => names.get(key) || 'Unknown contact';
  const title =
    safeName(chat.title) || (chat.peer ? names.get(chat.peer) : undefined) || 'Conversation';
  const zip = new ExportZip(options.write, check);
  for (const folder of ['Media/', 'Links/', 'Documents/']) await zip.add(folder, []);
  async function* rows(digest: ReturnType<typeof sha256.create>) {
    let cursor: ExportCursor | undefined;
    while (true) {
      check();
      const page = await engine.exportPage(chatId, snapshot.through, cursor);
      check();
      if (!page.length) return;
      for (const row of page) {
        check();
        // Metadata only: edits, removals, reply changes and newly available
        // attachments invalidate the export, while receipt traffic does not.
        // SQLite's native dictionaries can enumerate identical columns in a
        // different order on each pass. Canonicalize keys, keeping every value
        // in the integrity check so real edits/deletions still abort.
        digest.update(exportRowBytes(row));
        yield row;
      }
      const last = page.at(-1)!;
      cursor = { sentAt: last.sentAt, sequence: last.sequence };
      if (page.length < 120) return;
    }
  }
  let attachments = 0,
    missingAttachments = 0,
    processed = 0,
    messages = 0;
  const attachmentDigest = sha256.create();
  // Attachment-first pass allows HTML to describe actual exported availability.
  for await (const row of rows(attachmentDigest)) {
    if (row.attachment && row.kind !== 'deleted') {
      const media = await engine.media(row.attachment);
      check();
      if (media && media.bytes.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(media.bytes)) {
        await zip.add(exportAttachmentPath(row), base64Chunks(media.bytes));
        attachments++;
      } else missingAttachments++;
    } else if (['image', 'voice', 'file'].includes(row.kind)) missingAttachments++;
    options.onProgress?.(++processed);
  }
  const expectedDigest = bytesToHex(attachmentDigest.digest());
  const verifyDigest = (digest: ReturnType<typeof sha256.create>) => {
    if (bytesToHex(digest.digest()) !== expectedDigest) throw new Error('EXPORT_CHANGED');
  };
  async function* transcript() {
    const digest = sha256.create();
    yield textBytes(
      header(title) +
        `<p class="meta">Mnelo conversation export · ${escapeExportHTML(stamp(options.generatedAt ?? Date.now()))}</p><p>All locally stored messages available when export began. Deleted messages stay deleted; unavailable attachments are marked. Times are UTC. External links need an internet connection.</p><p><a href="Links/index.html">Links</a> · <a href="Media/">Media</a> · <a href="Documents/">Documents</a></p>`,
    );
    for await (const row of rows(digest)) {
      let html = `<article id="m-${row.sequence}"><strong>${escapeExportHTML(name(row.sender))}</strong><div class="meta">${escapeExportHTML(stamp(row.sentAt))}${row.editedAt ? ' · Edited ' + escapeExportHTML(stamp(row.editedAt)) : ''}</div>`;
      if (row.replyTo) {
        const preview = row.replyKind
          ? plainMessage({ kind: row.replyKind, body: row.replyBody ?? '' }, contacts)
          : 'Original message unavailable';
        const quote = `${row.replySender ? name(row.replySender) + ': ' : ''}${preview}`;
        html += `<blockquote>${row.replySequence ? `<a href="#m-${row.replySequence}">${escapeExportHTML(quote)}</a>` : escapeExportHTML(quote)}</blockquote>`;
      }
      html += `<p>${escapeExportHTML(plainMessage(row, contacts))}</p>`;
      if (row.attachment && row.kind !== 'deleted') {
        const path = exportAttachmentPath(row),
          available = zip.has(path);
        if (row.mime === richMime)
          html += `<p>${escapeExportHTML(richText(await engine.media(row.attachment)))}</p>`;
        if (available) {
          const href = escapeExportHTML(relativeURL(path));
          const filename = path.slice(path.lastIndexOf('/') + 1);
          html += `<p><a href="${href}" download="${escapeExportHTML(filename)}">${escapeExportHTML(filename)}</a></p>`;
          // Only passive media types are previewed. HTML/SVG/documents remain download links.
          if (/^image\/(jpeg|png|gif|webp)$/u.test(row.mime ?? ''))
            html += `<img src="${href}" alt="${escapeExportHTML(filename)}" loading="lazy">`;
          else if (/^video\/(mp4|webm|quicktime)$/u.test(row.mime ?? ''))
            html += `<video controls preload="none" src="${href}"></video>`;
          else if (/^audio\/(mpeg|mp4|aac|ogg|wav|x-m4a)$/u.test(row.mime ?? ''))
            html += `<audio controls preload="none" src="${href}"></audio>`;
        } else
          html += `<p class="missing">Attachment unavailable on this device: ${escapeExportHTML(row.name ?? 'Attachment')}</p>`;
      } else if (['image', 'voice', 'file'].includes(row.kind))
        html += '<p class="missing">Attachment unavailable on this device.</p>';
      const links = messageLinks(row.kind === 'deleted' ? '' : row.body);
      if (links.length)
        html += `<ul>${links.map((url) => `<li><a href="${escapeExportHTML(url)}" rel="noreferrer noopener">${escapeExportHTML(url)}</a></li>`).join('')}</ul>`;
      yield textBytes(html + '</article>');
      messages++;
    }
    verifyDigest(digest);
    yield textBytes(footer);
  }
  await zip.add('Chat.html', transcript());
  async function* linksIndex() {
    const digest = sha256.create();
    yield textBytes(
      header('Links') +
        '<p><a href="../Chat.html">Back to conversation</a></p><p>External websites require an internet connection. No website content is downloaded by this export.</p><ul>',
    );
    for await (const row of rows(digest))
      for (const url of messageLinks(row.kind === 'deleted' ? '' : row.body))
        yield textBytes(
          `<li><a href="${escapeExportHTML(url)}" rel="noreferrer noopener">${escapeExportHTML(url)}</a> · ${escapeExportHTML(name(row.sender))} · <a href="../Chat.html#m-${row.sequence}">${escapeExportHTML(stamp(row.sentAt))}</a></li>`,
        );
    verifyDigest(digest);
    yield textBytes('</ul>' + footer);
  }
  await zip.add('Links/index.html', linksIndex());
  await zip.finish();
  return {
    messages,
    attachments,
    missingAttachments,
    bytes: zip.bytes,
    proof: { owner: account.key, through: snapshot.through, digest: expectedDigest },
  };
}
