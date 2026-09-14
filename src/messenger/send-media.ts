import { File } from 'expo-file-system';
import {
  discardCachedMedia,
  MEDIA_SELECTION_LIMIT,
  type SelectedMedia,
} from '@/features/chats/media-files';
import type { DeviceMessenger } from './engine';
import { MEDIA_MAX_BYTES } from './delivery/media-schema';
import { MediaBatchError } from './media-send-error';

type MediaKind = 'image' | 'file' | 'voice';
type SendOptions = Parameters<DeviceMessenger['send']>[2];
const maxBytes = MEDIA_MAX_BYTES - 16;

function checkFile(file: SelectedMedia) {
  const source = new File(file.uri);
  if (!source.exists || source.size < 1) throw new Error('MEDIA_READ_FAILED');
  if (source.size > maxBytes)
    throw new Error(file.mime.startsWith('video/') ? 'VIDEO_SIZE_LIMIT' : 'MEDIA_SIZE_LIMIT');
  if (file.duration != null && (!Number.isFinite(file.duration) || file.duration > 3600))
    throw new Error('MEDIA_DURATION_LIMIT');
  return source;
}

export async function sendSelectedMedia(
  files: SelectedMedia[],
  kind: MediaKind,
  send: (body: string, options: SendOptions) => Promise<string>,
  replyTo?: string,
) {
  let sent = 0;
  try {
    if (files.length > MEDIA_SELECTION_LIMIT) throw new Error('MEDIA_SELECTION_LIMIT');
    // Validate the entire selection before committing the first item.
    files.forEach(checkFile);
    for (const file of files) {
      const source = checkFile(file);
      let bytes: string;
      try {
        bytes = await source.base64();
      } catch {
        throw new Error('MEDIA_READ_FAILED');
      }
      if (bytes.length > 4 * Math.ceil(maxBytes / 3))
        throw new Error(file.mime.startsWith('video/') ? 'VIDEO_SIZE_LIMIT' : 'MEDIA_SIZE_LIMIT');
      await send('', {
        kind: file.mime.startsWith('video/') ? 'file' : kind,
        ...(replyTo ? { replyTo } : {}),
        ...(files.length > 1 ? { deferDelivery: true } : {}),
        media: { name: file.name, mime: file.mime, bytes, duration: file.duration ?? null },
      });
      sent++;
    }
    return sent;
  } catch (cause) {
    if (sent) throw new MediaBatchError(sent, files.length, cause);
    throw cause;
  } finally {
    files.forEach((file, index) => {
      // An uncommitted voice preview must remain available for retry.
      if (kind !== 'voice' || index < sent) discardCachedMedia(file.uri);
    });
  }
}
