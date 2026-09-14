import { imageSelection, fileSelection } from '@/features/chats/media-files';
const mockLibrary = jest.fn();
const mockDocument = jest.fn();
const mockManipulate = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: () => mockDocument() }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: mockManipulate } }));
test('Photos accepts videos and preserves their MIME/duration without trying to convert them to JPEG', async () => {
  mockLibrary.mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        type: 'video',
        uri: 'file:///cache/movie.mov',
        fileName: 'movie.mov',
        mimeType: 'video/quicktime',
        duration: 2500,
      },
    ],
  });
  await expect(imageSelection()).resolves.toEqual({
    uri: 'file:///cache/movie.mov',
    name: 'movie.mov',
    mime: 'video/quicktime',
    duration: 2.5,
  });
  expect(mockLibrary).toHaveBeenCalledWith(
    expect.objectContaining({ mediaTypes: ['images', 'videos'] }),
  );
  expect(mockManipulate).not.toHaveBeenCalled();
});
test('Files retains a recognized video MIME so the receiver can show a playable preview', async () => {
  mockDocument.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: 'file:///cache/clip.mp4', name: 'clip.mp4', mimeType: 'video/mp4', size: 2000 },
    ],
  });
  await expect(fileSelection()).resolves.toEqual({
    uri: 'file:///cache/clip.mp4',
    name: 'clip.mp4',
    mime: 'video/mp4',
  });
});
