import { File, Paths } from 'expo-file-system';

let exporting = false;
function sweep() {
  try {
    for (const entry of Paths.cache.list()) {
      if (
        entry instanceof File &&
        entry.name.startsWith('mnelo-chat-export-') &&
        entry.name.endsWith('.zip')
      ) {
        try {
          entry.delete();
        } catch {
          /* Retry a locked orphan on a later launch. */
        }
      }
    }
  } catch {
    /* Cache may not be readable before the first device unlock. */
  }
}
export function cleanupChatExports() {
  if (!exporting) sweep();
}
export function beginChatExport() {
  if (exporting) return false;
  exporting = true;
  sweep();
  return true;
}
export function finishChatExport() {
  exporting = false;
}
