import type { Media } from './model';
export type VideoPreview = {
  uri: string;
  thumbnail: { uri: string; width: number; height: number } | null;
  dispose: () => void;
};
export async function prepareVideoPreview(media: Media): Promise<VideoPreview> {
  const bytes = Uint8Array.from(atob(media.bytes), (value) => value.charCodeAt(0));
  const uri = URL.createObjectURL(new Blob([bytes], { type: media.mime }));
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  let thumbnail: VideoPreview['thumbnail'] = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('VIDEO_PREVIEW_TIMEOUT')), 10000);
      video.onloadeddata = () => {
        clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('VIDEO_PREVIEW_FAILED'));
      };
      video.src = uri;
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / video.videoWidth, 800 / video.videoHeight);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    thumbnail = {
      uri: canvas.toDataURL('image/jpeg', 0.8),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    // Playback remains available when a browser cannot extract the poster.
  } finally {
    video.removeAttribute('src');
    video.load();
  }
  return { uri, thumbnail, dispose: () => URL.revokeObjectURL(uri) };
}
