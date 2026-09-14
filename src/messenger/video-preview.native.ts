import { File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { createVideoPlayer } from 'expo-video';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { discardCachedMedia } from '@/features/chats/media-files';
import type { Media } from './model';

export type VideoPreview = {
  uri: string;
  thumbnail: { uri: string; width: number; height: number } | null;
  dispose: () => void;
};

export async function prepareVideoPreview(media: Media): Promise<VideoPreview> {
  const extension =
    media.mime === 'video/quicktime' ? 'mov' : media.mime === 'video/webm' ? 'webm' : 'mp4';
  const file = new File(Paths.cache, `mnelo-video-${randomUUID()}.${extension}`);
  const disposeFile = () => discardCachedMedia(file.uri);
  try {
    file.write(Uint8Array.from(atob(media.bytes), (value) => value.charCodeAt(0)));
  } catch (error) {
    disposeFile();
    throw error;
  }
  let player: ReturnType<typeof createVideoPlayer> | null = null;
  let thumbnail: VideoPreview['thumbnail'] = null;
  try {
    player = createVideoPlayer(null);
    player.muted = true;
    player.audioMixingMode = 'mixWithOthers';
    await player.replaceAsync(file.uri);
    const [frame] = await player.generateThumbnailsAsync(0, { maxWidth: 640, maxHeight: 800 });
    if (frame) {
      try {
        const context = ImageManipulator.manipulate(frame);
        try {
          const image = await context.renderAsync();
          try {
            thumbnail = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
          } finally {
            image.release();
          }
        } finally {
          context.release();
        }
      } finally {
        frame.release();
      }
    }
  } catch {
    // A missing poster must not prevent opening the original local video.
  } finally {
    player?.release();
  }
  return {
    uri: file.uri,
    thumbnail,
    dispose: () => {
      disposeFile();
      if (thumbnail) discardCachedMedia(thumbnail.uri);
    },
  };
}
