import { sendSelectedMedia } from '@/messenger/send-media';
import { mediaErrorMessage } from '@/messenger/media-send-error';
import { packetSchema } from '@/messenger/model';
const mockFiles = new Map<string, { size: number; exists?: boolean; fail?: boolean }>();
const mockReads = jest.fn();
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    get exists() {
      return mockFiles.get(uri)?.exists ?? true;
    },
    get size() {
      return mockFiles.get(uri)?.size ?? 3;
    },
    async base64() {
      mockReads(uri);
      if (mockFiles.get(uri)?.fail) throw new Error('file lost');
      return 'YWJj';
    },
  })),
}));
jest.mock('@/features/chats/media-files', () => ({
  MEDIA_SELECTION_LIMIT: 10,
  discardCachedMedia: (...args: unknown[]) => mockDelete(...args),
}));
const photo = (n: number) => ({ uri: `photo-${n}`, name: `${n}.jpg`, mime: 'image/jpeg' });
const video = { uri: 'video', name: 'clip.mp4', mime: 'video/mp4', duration: 3 };
const reply = '9e1c1c13-154f-4a0b-bb7a-d820af1500f2';
beforeEach(() => mockFiles.clear());
test('all selected photos and videos commit in order using packets accepted by the real message schema', async () => {
  const send = jest.fn(async (body, options) => {
    packetSchema.parse({
      type: 'message',
      id: reply,
      chat: 'chat',
      sentAt: Date.now(),
      body,
      kind: options.kind,
      media: options.media,
      replyTo: options.replyTo,
    });
    return 'saved-message-id';
  });
  await expect(sendSelectedMedia([photo(1), video, photo(2)], 'image', send, reply)).resolves.toBe(
    3,
  );
  expect(
    send.mock.calls.map(([, options]) => [
      options.kind,
      options.media.name,
      options.replyTo,
      options.deferDelivery,
    ]),
  ).toEqual([
    ['image', '1.jpg', reply, true],
    ['file', 'clip.mp4', reply, true],
    ['image', '2.jpg', reply, true],
  ]);
  expect(mockReads.mock.calls.flat()).toEqual(['photo-1', 'video', 'photo-2']);
  expect(mockDelete.mock.calls.flat()).toEqual(['photo-1', 'video', 'photo-2']);
});
test('oversized video is rejected before any photo is sent or base64 is loaded, with a specific explanation', async () => {
  mockFiles.set('video', { size: 11 * 1024 * 1024 });
  const send = jest.fn();
  const error = await sendSelectedMedia([photo(1), video], 'image', send).catch((e) => e);
  expect(mediaErrorMessage(error).key).toBe('videoLimit');
  expect(send).not.toHaveBeenCalled();
  expect(mockReads).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalledTimes(2);
});
test('partial local failures report committed count and never retry already committed messages', async () => {
  const send = jest
    .fn()
    .mockResolvedValueOnce('first')
    .mockRejectedValueOnce(new Error('database'));
  const error = await sendSelectedMedia([photo(1), photo(2), photo(3)], 'image', send).catch(
    (e) => e,
  );
  expect(mediaErrorMessage(error)).toEqual({
    key: 'mediaBatchPartial',
    values: { sent: 1, total: 3 },
  });
  expect(send).toHaveBeenCalledTimes(2);
  expect(mockDelete).toHaveBeenCalledTimes(3);
});
test('a missing file cannot produce an empty message and an unreadable voice preview is kept for retry', async () => {
  mockFiles.set('video', { size: 3, exists: false });
  const send = jest.fn();
  await expect(sendSelectedMedia([video], 'image', send)).rejects.toThrow('MEDIA_READ_FAILED');
  expect(send).not.toHaveBeenCalled();
  mockDelete.mockClear();
  mockFiles.set('voice', { size: 3, fail: true });
  await expect(
    sendSelectedMedia([{ uri: 'voice', name: 'voice.m4a', mime: 'audio/mp4' }], 'voice', send),
  ).rejects.toThrow('MEDIA_READ_FAILED');
  expect(mockDelete).not.toHaveBeenCalled();
});
test('a valid short video sends as a file without a batch-only delivery deferral', async () => {
  const send = jest.fn().mockResolvedValue('video-id');
  await sendSelectedMedia([video], 'image', send);
  expect(send).toHaveBeenCalledWith('', {
    kind: 'file',
    media: { name: video.name, mime: video.mime, duration: 3, bytes: 'YWJj' },
  });
});
