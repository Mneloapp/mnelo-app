import { launchImageLibraryAsync } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { validAvatar } from './profile-avatar';

export async function pickProfilePhoto(): Promise<string | null> {
  const selection = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  if (selection.canceled || !selection.assets[0]) return null;
  const asset = selection.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    context.resize(asset.width >= asset.height ? { width: 320 } : { height: 320 });
    const rendered = await context.renderAsync();
    try {
      for (const quality of [0.7, 0.45, 0.25]) {
        const result = await rendered.saveAsync({
          format: SaveFormat.JPEG,
          compress: quality,
          base64: true,
        });
        try {
          if (result.base64 && validAvatar(result.base64)) return result.base64;
        } finally {
          const temporary = new File(result.uri);
          if (temporary.exists) temporary.delete();
        }
      }
    } finally {
      rendered.release();
    }
  } finally {
    context.release();
    // Only Expo's temporary picker copy; never delete a photo-library original.
    const directory = Paths.cache.uri.replace(/\/?$/, '/') + 'ImagePicker/';
    if (
      asset.uri.startsWith(directory) &&
      /^[a-z0-9_-]+\.(jpg|jpeg|png|heic)$/i.test(asset.uri.slice(directory.length))
    ) {
      const copy = new File(asset.uri);
      if (copy.exists) copy.delete();
    }
  }
  throw new Error('PROFILE_PHOTO_TOO_LARGE');
}
