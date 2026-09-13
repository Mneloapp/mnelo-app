export type ScreenCapture = { stream: MediaStream; stop(): void };
export function waitForCapture(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('SCREEN_SHARE_CANCELLED'));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(new Error('SCREEN_SHARE_CANCELLED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 200);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
