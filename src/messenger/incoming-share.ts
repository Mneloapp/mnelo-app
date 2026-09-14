import type { SharePayload } from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Image, Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { discardCachedMedia } from '@/features/chats/media-files';
import { incomingFileBridge, resolveSharedFile } from './share-native';
import type { Media } from './model';

export const shareGroup = 'group.com.mnelo.messenger.sharing';
export const shareLimit = 10 * 1024 * 1024;
// Source photos are resized before applying the encrypted transport limit.
export const shareImageSourceLimit = 50 * 1024 * 1024;
export type IncomingItem = {
  id: string;
  label: string;
  text?: string;
  uri?: string;
  mime: string;
  image: boolean;
};

export async function claimIncoming(payloads: readonly SharePayload[]) {
  if (payloads.length > 10) throw new Error('SHARE_TOO_MANY');
  if (!incomingFileBridge) return incomingItems(payloads);
  const files = payloads.filter((item) => item.shareType !== 'text' && item.shareType !== 'url');
  const claimed = await incomingFileBridge.claimIncomingFiles(files.map((item) => item.value));
  return incomingItems(
    payloads.map((item) => ({ ...item, value: claimed[item.value] ?? item.value })),
  ).map((item, index) => ({
    ...item,
    // Keep the sender's filename, without the cache's unique prefix.
    ...(item.uri
      ? {
          label: decodeURIComponent(payloads[index]!.value.split('/').at(-1) ?? 'file')
            .replace(/[\x00-\x1f\x7f/\\]/g, '_')
            .slice(-160),
        }
      : {}),
  }));
}

const filePath = (value: string) =>
  decodeURIComponent(new URL(value).pathname).replace(/^\/private\/var\//, '/var/');
function inside(uri: string, root: string) {
  try {
    const path = filePath(uri);
    const base = filePath(root).replace(/\/?$/, '/');
    return (
      uri.startsWith('file://') &&
      !new URL(uri).host &&
      path.startsWith(base) &&
      !path.split('/').includes('..')
    );
  } catch {
    return false;
  }
}
export function ownedShareFile(uri: string) {
  if (inside(uri, Paths.cache.uri)) return true;
  if (resolveSharedFile) return Boolean(resolveSharedFile(uri));
  const group = Paths.appleSharedContainers?.[shareGroup];
  return Boolean(group && inside(uri, group.uri.replace(/\/?$/, '/') + 'MneloIncoming/'));
}

// Treat a Maps/Safari URL as text. Receiving a share never fetches URLs or follows redirects.
export function incomingItems(payloads: readonly SharePayload[]): IncomingItem[] {
  if (payloads.length > 10) throw new Error('SHARE_TOO_MANY');
  return payloads.map((payload, index) => {
    const id = String(index);
    if (payload.shareType === 'text' || payload.shareType === 'url') {
      const text = payload.value.trim();
      if (!text || text.length > 8000) throw new Error('SHARE_INVALID');
      if (payload.shareType === 'url') {
        const url = new URL(text);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
          throw new Error('SHARE_INVALID');
      }
      return { id, label: text, text, mime: 'text/plain', image: false };
    }
    if (
      !['image', 'file', 'video', 'audio'].includes(payload.shareType) ||
      !(
        ownedShareFile(payload.value) ||
        (Platform.OS === 'android' && payload.value.startsWith('content://'))
      )
    )
      throw new Error('SHARE_INVALID');
    const uri = resolveSharedFile?.(payload.value) ?? payload.value;
    const file = new File(uri);
    if (!file.exists || !file.size) throw new Error('SHARE_FILE_UNAVAILABLE');
    const mime =
      payload.mimeType && /^[\w.+-]+\/[\w.+-]+$/.test(payload.mimeType)
        ? payload.mimeType
        : 'application/octet-stream';
    const image = payload.shareType === 'image';
    if (file.size > (image ? shareImageSourceLimit : shareLimit))
      throw new Error(image ? 'SHARE_IMAGE_SIZE' : 'SHARE_FILE_SIZE');
    const label =
      decodeURIComponent(payload.value.split('/').at(-1) ?? 'file')
        .replace(/[\x00-\x1f\x7f/\\]/g, '_')
        .slice(-160) || 'file';
    return {
      id,
      label,
      uri,
      mime,
      image,
    };
  });
}

export async function prepareIncoming(
  item: IncomingItem,
): Promise<{ body: string; kind: 'image' | 'file' | 'text'; media?: Media }> {
  if (item.text) return { body: item.text, kind: 'text' };
  if (!item.uri) throw new Error('SHARE_INVALID');
  let uri = item.uri;
  let mime = item.mime;
  let name = item.label;
  if (item.image) {
    const { width, height } = await Image.getSize(uri);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height > 100_000_000
    )
      throw new Error('SHARE_IMAGE_SIZE');
    const context = ImageManipulator.manipulate(uri);
    try {
      context.resize(
        width >= height ? { width: Math.min(1600, width) } : { height: Math.min(1600, height) },
      );
      const rendered = await context.renderAsync();
      try {
        uri = (await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri;
      } finally {
        rendered.release();
      }
    } finally {
      context.release();
    }
    mime = 'image/jpeg';
    name = item.label.replace(/\.[^.]+$/, '') + '.jpg';
  }
  try {
    const file = new File(uri);
    if (!file.size || file.size > shareLimit) throw new Error('SHARE_FILE_SIZE');
    return {
      body: '',
      kind: item.image ? 'image' : 'file',
      media: { name, mime, bytes: await file.base64(), duration: null },
    };
  } finally {
    if (uri !== item.uri) discardCachedMedia(uri);
  }
}

export function discardIncoming(payloads: readonly SharePayload[]) {
  if (incomingFileBridge) {
    void incomingFileBridge
      .discardIncomingFiles(
        payloads
          .filter((item) => item.shareType !== 'url' && item.shareType !== 'text')
          .map((item) => item.value),
      )
      .catch(() => undefined);
    return;
  }
  for (const item of payloads) {
    if (item.shareType === 'url' || item.shareType === 'text' || !ownedShareFile(item.value))
      continue;
    try {
      const file = new File(resolveSharedFile?.(item.value) ?? item.value);
      if (file.exists) file.delete();
    } catch {
      /* Retry expiry cleanup on next share. */
    }
  }
}
