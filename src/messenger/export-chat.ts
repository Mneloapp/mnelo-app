import type { DeviceMessenger } from './engine';
import type { ContactView } from './contact-view';

export type ExportChatOptions = {
  isCurrent?: () => boolean;
  onProgress?: (count: number) => void;
};
export { cleanupChatExports } from './chat-export-cache';

export async function exportChat(
  _engine: DeviceMessenger,
  _view: ContactView,
  _chatId: string,
  _options: ExportChatOptions = {},
): Promise<void> {
  throw new Error('EXPORT_UNAVAILABLE');
}
