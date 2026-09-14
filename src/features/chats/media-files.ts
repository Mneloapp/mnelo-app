import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { RepositoryError } from '@/services/repository';
export type SelectedMedia = { uri: string; name: string; mime: string; duration?: number };
export async function imageSelection(camera = false): Promise<SelectedMedia | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new RepositoryError('CAMERA_PERMISSION_REQUIRED');
  }
  const result = camera
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 1,
        exif: false,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 1,
        exif: false,
      });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.type === 'video') {
    return {
      uri: asset.uri,
      name: asset.fileName || 'video.mp4',
      mime:
        asset.mimeType ||
        (asset.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'),
      ...(asset.duration != null ? { duration: asset.duration / 1000 } : {}),
    };
  }
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize(
      asset.width >= asset.height
        ? { width: Math.min(1600, asset.width) }
        : { height: Math.min(1600, asset.height) },
    );
    const rendered = await context.renderAsync();
    const jpeg = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return { uri: jpeg.uri, name: 'photo.jpg', mime: 'image/jpeg' };
  } finally {
    // Picker-owned cached originals are no longer needed after processing.
    discardCachedMedia(asset.uri);
  }
}
export async function fileSelection(): Promise<SelectedMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > 20 * 1024 * 1024) {
    discardCachedMedia(asset.uri);
    throw new RepositoryError('INVALID');
  }
  const mime = [
    'application/pdf',
    'text/plain',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ].includes(asset.mimeType ?? '')
    ? asset.mimeType!
    : 'application/octet-stream';
  return {
    uri: asset.uri,
    name: asset.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 160) || 'attachment',
    mime,
  };
}
export async function mediaBytes(uri: string) {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  const file = new File(uri);
  if (file.size > 20 * 1024 * 1024) throw new RepositoryError('INVALID');
  return file.arrayBuffer();
}
export function discardCachedMedia(uri: string) {
  if (Platform.OS !== 'web' && uri.startsWith(Paths.cache.uri)) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      /* Best effort cache cleanup; never delete user-owned source files. */
    }
  }
}
