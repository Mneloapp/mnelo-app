import { albumStatus, photoAlbums, timelineContains } from '@/messenger/photo-albums';
import type { LocalMessage } from '@/messenger/model';
const photo = (n: number, overrides: Partial<LocalMessage> = {}): LocalMessage => ({
  id: String(n),
  chatId: 'chat',
  sender: 'me',
  kind: 'image',
  body: '',
  sentAt: n * 1000,
  receivedAt: n * 1000,
  replyTo: null,
  attachment: String(n),
  status: 'delivered',
  sequence: n,
  ...overrides,
});
test('consecutive photos form one chronological album without losing individual IDs or receipt states', () => {
  const input = [photo(7), photo(6), photo(5), photo(4), photo(3), photo(2), photo(1)];
  const rows = photoAlbums(input);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.photos?.map((p) => p.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  expect(timelineContains(rows[0]!, '6')).toBe(true);
  expect(input[0]?.id).toBe('7');
  expect(albumStatus([photo(1, { status: 'read' }), photo(2)])).toBe('delivered');
  expect(albumStatus([photo(1, { status: 'pending' }), photo(2)])).toBe('pending');
  expect(albumStatus([photo(1, { status: 'read' }), photo(2, { status: 'read' })])).toBe('read');
});
test('albums never cross people, conversations, intervening text, quotes or captions', () => {
  for (const overrides of [
    { sender: 'other' },
    { chatId: 'other' },
    { kind: 'text' },
    { body: 'Caption' },
    { replyTo: 'quoted' },
    { kind: 'deleted' },
    { sentAt: 100000 },
  ])
    expect(photoAlbums([photo(2), photo(1, overrides)])).toHaveLength(2);
  expect(photoAlbums([photo(3), photo(2, { kind: 'text' }), photo(1)])).toHaveLength(3);
  const afterDeletion = photoAlbums([photo(3), photo(2, { kind: 'deleted' }), photo(1)]);
  expect(afterDeletion[1]?.kind).toBe('deleted');
});
