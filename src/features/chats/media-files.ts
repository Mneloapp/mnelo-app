import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { RepositoryError } from '@/services/repository';
export type SelectedMedia = { uri: string; name: string; mime: string; duration?: number };
export const MEDIA_SELECTION_LIMIT = 10;

// Kept for screens that deliberately accept just one attachment.
export async function imageSelection(camera = false): Promise<SelectedMedia | null> {
  return (await selectImages(camera, false))[0] ?? null;
}
export async function imageSelections(camera = false): Promise<SelectedMedia[]> {
  return selectImages(camera, !camera);
}
async function selectImages(camera: boolean, multiple: boolean): Promise<SelectedMedia[]> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new RepositoryError('CAMERA_PERMISSION_REQUIRED');
  }
  let result: ImagePicker.ImagePickerResult;
  try {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 1,
      exif: false,
      // Camera originals can exceed the encrypted attachment limit in seconds.
      // iOS exports a smaller, compatible MP4 and can retrieve iCloud originals.
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      shouldDownloadFromNetwork: true,
    };
    result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({
          ...options,
          allowsMultipleSelection: multiple,
          selectionLimit: multiple ? MEDIA_SELECTION_LIMIT : 1,
          orderedSelection: multiple,
        });
  } catch {
    throw new Error('MEDIA_PICKER_FAILED');
  }
  if (result.canceled) return [];
  const selected: SelectedMedia[] = [];
  try {
    if (result.assets.length > (multiple ? MEDIA_SELECTION_LIMIT : 1))
      throw new Error('MEDIA_SELECTION_LIMIT');
    // Process one asset at a time so a multi-photo selection doesn't retain
    // several full-resolution decoded images at once.
    for (const asset of result.assets) selected.push(await prepareImageAsset(asset));
    return selected;
  } catch (cause) {
    for (const file of selected) discardCachedMedia(file.uri);
    for (const asset of result.assets) discardCachedMedia(asset.uri);
    throw cause;
  }
}
async function prepareImageAsset(asset: ImagePicker.ImagePickerAsset): Promise<SelectedMedia> {
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) {
    const duration = asset.duration != null ? asset.duration / 1000 : undefined;
    if (duration != null && duration > 3600) throw new Error('MEDIA_DURATION_LIMIT');
    return {
      uri: asset.uri,
      name: (asset.fileName || 'video.mp4').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 160),
      mime:
        asset.mimeType ||
        (asset.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'),
      ...(duration != null && Number.isFinite(duration) && duration >= 0 ? { duration } : {}),
    };
  }
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    context.resize(
      asset.width >= asset.height
        ? { width: Math.min(1600, asset.width) }
        : { height: Math.min(1600, asset.height) },
    );
    rendered = await context.renderAsync();
    const jpeg = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return { uri: jpeg.uri, name: 'photo.jpg', mime: 'image/jpeg' };
  } catch {
    throw new Error('MEDIA_PICKER_FAILED');
  } finally {
    rendered?.release();
    context.release();
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
    throw new Error(asset.mimeType?.startsWith('video/') ? 'VIDEO_SIZE_LIMIT' : 'MEDIA_SIZE_LIMIT');
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
