import { prepareVideoPreview } from '@/messenger/video-preview.native';
const mockDiscard = jest.fn();
const mockReleasePlayer = jest.fn();
const mockReleaseFrame = jest.fn();
const mockReleaseContext = jest.fn();
const mockReleaseImage = jest.fn();
const mockReplace = jest.fn(async () => {});
const mockFrames = jest.fn(async () => [{ release: mockReleaseFrame }]);
const mockSave = jest.fn(async () => ({
  uri: 'file:///cache/poster.jpg',
  width: 600,
  height: 800,
}));
jest.mock('expo-video', () => ({
  createVideoPlayer: () => ({
    replaceAsync: mockReplace,
    generateThumbnailsAsync: mockFrames,
    release: mockReleasePlayer,
  }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture-video' }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: {} },
  File: class {
    uri: string;
    constructor(_path: unknown, name: string) {
      this.uri = 'file:///cache/' + name;
    }
    write() {}
  },
}));
jest.mock('@/features/chats/media-files', () => ({
  discardCachedMedia: (uri: string) => mockDiscard(uri),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      release: mockReleaseContext,
      renderAsync: async () => ({ saveAsync: mockSave, release: mockReleaseImage }),
    }),
  },
}));
const media = { name: '../../movie.mov', mime: 'video/quicktime', bytes: 'YQ==', duration: 4 };
test('video poster uses the local original, releases the decoder, and removes both cache files on disposal', async () => {
  const preview = await prepareVideoPreview(media);
  expect(mockReplace).toHaveBeenCalledWith('file:///cache/mnelo-video-fixture-video.mov');
  expect(preview.thumbnail).toEqual({ uri: 'file:///cache/poster.jpg', width: 600, height: 800 });
  for (const release of [mockReleasePlayer, mockReleaseFrame, mockReleaseContext, mockReleaseImage])
    expect(release).toHaveBeenCalledTimes(1);
  expect(mockDiscard).not.toHaveBeenCalled();
  preview.dispose();
  expect(mockDiscard).toHaveBeenCalledWith(preview.uri);
  expect(mockDiscard).toHaveBeenCalledWith('file:///cache/poster.jpg');
});
test('a thumbnail decode failure leaves original video available and still releases the decoder', async () => {
  mockFrames.mockRejectedValueOnce(new Error('unsupported poster'));
  const preview = await prepareVideoPreview(media);
  expect(preview.thumbnail).toBeNull();
  expect(preview.uri).toContain('.mov');
  expect(mockReleasePlayer).toHaveBeenCalledTimes(1);
  preview.dispose();
  expect(mockDiscard).toHaveBeenCalledTimes(1);
});
