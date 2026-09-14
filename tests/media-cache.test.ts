import { discardCachedMedia, fileSelection } from '@/features/chats/media-files';
const mockDelete = jest.fn();
const mockPick = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///development/cache/' } },
  File: jest.fn().mockImplementation(() => ({ exists: true, delete: mockDelete })),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockPick(...args),
}));
test('cache cleanup never removes user-owned source files', () => {
  discardCachedMedia('file:///development/documents/personal.pdf');
  discardCachedMedia('content://media/owned-photo');
  expect(mockDelete).not.toHaveBeenCalled();
  discardCachedMedia('file:///development/cache/temporary.pdf');
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
test('rejected oversized picker copies are discarded from the app cache', async () => {
  mockPick.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///development/cache/large.pdf', size: 21 * 1024 * 1024 }],
  });
  await expect(fileSelection()).rejects.toThrow('MEDIA_SIZE_LIMIT');
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
