import { AppState } from 'react-native';
import { File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import type { DeviceMessenger } from './engine';
import type { ContactView } from './contact-view';
import type { ExportChatOptions } from './export-chat';
import { createChatExport } from './chat-export';

import { beginChatExport, finishChatExport } from './chat-export-cache.native';
export { cleanupChatExports } from './chat-export-cache.native';

const prefix = 'mnelo-chat-export-';

export async function exportChat(
  engine: DeviceMessenger,
  view: ContactView,
  chatId: string,
  options: ExportChatOptions = {},
): Promise<void> {
  if (!beginChatExport()) return;
  let cancelled = false;
  let preparing = true;
  const owner = engine.currentIdentity()?.key;
  let file: File | undefined;
  let handle: FileHandle | undefined;
  const subscription = AppState.addEventListener('change', (state) => {
    if (preparing && state !== 'active') cancelled = true;
  });
  const checkCancelled = () => {
    if (
      cancelled ||
      !owner ||
      engine.currentIdentity()?.key !== owner ||
      options.isCurrent?.() === false ||
      AppState.currentState !== 'active'
    )
      throw new Error('CHAT_EXPORT_CANCELLED');
  };
  try {
    checkCancelled();
    if (!(await Sharing.isAvailableAsync())) throw new Error('EXPORT_UNAVAILABLE');
    checkCancelled();
    // Remove abandoned partial exports from an interrupted prior launch. Only
    // this dedicated prefix belongs to this feature; unrelated caches stay put.
    file = new File(Paths.cache, `${prefix}${randomUUID()}.zip`);
    file.create();
    handle = file.open(FileMode.WriteOnly);
    let sinceYield = 0;
    await createChatExport(engine, view, chatId, {
      checkCancelled,
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      write: async (bytes) => {
        checkCancelled();
        handle!.writeBytes(bytes);
        sinceYield += bytes.byteLength;
        if (sinceYield >= 256 * 1024) {
          sinceYield = 0;
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          checkCancelled();
        }
      },
    });
    handle.close();
    handle = undefined;
    checkCancelled();
    // The completed archive no longer needs database access. The system share
    // sheet may now make the app inactive while the user chooses Save to Files.
    preparing = false;
    await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' });
  } catch (error) {
    if (!(error instanceof Error && error.message === 'CHAT_EXPORT_CANCELLED')) throw error;
  } finally {
    subscription.remove();
    try {
      handle?.close();
    } catch {
      /* Already closed by native cleanup. */
    }
    try {
      if (file?.exists) file.delete();
    } catch {
      /* Retried on the next export. */
    }
    finishChatExport();
  }
}
