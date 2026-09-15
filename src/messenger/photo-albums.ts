import type { LocalMessage } from './model';

export type ChatTimelineRow = LocalMessage & { photos?: LocalMessage[] };

function photo(message: LocalMessage) {
  return (
    message.kind === 'image' && Boolean(message.attachment) && !message.body && !message.replyTo
  );
}

// Presentation only: nearby consecutive photos remain individual messages for
// delivery, deletion, reactions and replies, including history from older builds.
export function photoAlbums(messages: readonly LocalMessage[]): ChatTimelineRow[] {
  const rows: ChatTimelineRow[] = [];
  for (let index = 0; index < messages.length;) {
    const newest = messages[index++]!;
    const photos = [newest];
    if (photo(newest)) {
      while (index < messages.length && photos.length < 10) {
        const next = messages[index]!;
        if (
          !photo(next) ||
          next.chatId !== newest.chatId ||
          next.sender !== newest.sender ||
          Math.abs(newest.sentAt - next.sentAt) > 60000
        )
          break;
        photos.push(next);
        index++;
      }
    }
    if (photos.length === 1) rows.push(newest);
    else {
      photos.reverse();
      rows.push({ ...newest, id: photos[0]!.id, photos });
    }
  }
  return rows;
}

export function timelineContains(row: ChatTimelineRow, id: string | null) {
  return row.id === id || Boolean(row.photos?.some((photo) => photo.id === id));
}

export function albumStatus(photos: readonly LocalMessage[]): LocalMessage['status'] {
  if (photos.some((photo) => photo.status === 'pending')) return 'pending';
  if (photos.every((photo) => photo.status === 'read')) return 'read';
  return photos.every((photo) => photo.status === 'read' || photo.status === 'delivered')
    ? 'delivered'
    : 'received';
}
