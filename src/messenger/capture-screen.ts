import type { ScreenCapture } from './screen-capture';
export async function captureScreen(_id: string, signal: AbortSignal): Promise<ScreenCapture> {
  if (signal.aborted) throw new Error('SCREEN_SHARE_CANCELLED');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 15 },
    audio: false,
  });
  const stop = () => {
    stream.getTracks().forEach((track) => track.stop());
    signal.removeEventListener('abort', stop);
  };
  if (signal.aborted) {
    stop();
    throw new Error('SCREEN_SHARE_CANCELLED');
  }
  signal.addEventListener('abort', stop, { once: true });
  return { stream, stop };
}
