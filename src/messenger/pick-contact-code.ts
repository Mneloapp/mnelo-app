import { scanFromURLAsync } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { discardCachedMedia } from '@/features/chats/media-files';
import { parseContactLink } from './contact-link';

/** Reads only the photo explicitly selected in the OS picker. */
export async function pickContactCode(): Promise<
  { cancelled: true } | { cancelled: false; data: string | null }
> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return { cancelled: true };
  const { uri } = result.assets[0];
  try {
    // Never ask the QR decoder to fetch a remote URL.
    if (!/^(file|content|blob):/.test(uri)) return { cancelled: false, data: null };
    const codes = await scanFromURLAsync(uri, ['qr']);
    const valid = [
      ...new Set(codes.map((code) => code.data).filter((data) => parseContactLink(data))),
    ];
    // Different contact codes in one image are ambiguous; ask for a single code.
    return { cancelled: false, data: valid.length === 1 ? valid[0]! : null };
  } finally {
    discardCachedMedia(uri);
  }
}
