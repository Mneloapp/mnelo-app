export type BackgroundStatus = 'checking' | 'ready' | 'unavailable' | 'permission-required';
let value: BackgroundStatus = 'checking';
const listeners = new Set<() => void>();
let retry: (() => Promise<void>) | null = null;
export const backgroundSnapshot = () => value;
export const observeBackground = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setBackgroundStatus(next: BackgroundStatus) {
  if (value !== next) {
    value = next;
    listeners.forEach((listener) => listener());
  }
}
export function registerBackgroundRetry(action: (() => Promise<void>) | null) {
  retry = action;
}
export async function retryBackground() {
  await retry?.();
}
