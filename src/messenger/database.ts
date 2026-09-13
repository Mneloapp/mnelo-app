import type { LocalDatabase } from './model';
export async function openDeviceDatabase(): Promise<LocalDatabase> {
  // Do not silently put private browser history in an unencrypted storage fallback.
  throw new Error('NATIVE_DEVICE_REQUIRED');
}
