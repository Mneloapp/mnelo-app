import { imageSelection, imageSelections, fileSelection } from '@/features/chats/media-files';
const mockLibrary = jest.fn();
const mockCamera = jest.fn();
const mockPermission = jest.fn();
const mockDocument = jest.fn();
const mockManipulate = jest.fn();
const mockDelete = jest.fn();
const mockRelease = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
  requestCameraPermissionsAsync: () => mockPermission(),
  VideoExportPreset: { MediumQuality: 2 },
  UIImagePickerControllerQualityType: { Medium: 1 },
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: jest.fn().mockImplementation((uri) => ({ exists: true, delete: () => mockDelete(uri) })),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: () => mockDocument() }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: 'jpeg' },
}));
const movie = {
  type: 'video',
  uri: 'file:///cache/movie.mp4',
  fileName: 'movie.mp4',
  mimeType: 'video/mp4',
  duration: 2500,
};
beforeEach(() => {
  mockManipulate.mockImplementation((uri: string) => ({
    resize: jest.fn(),
    release: mockRelease,
    renderAsync: async () => ({
      release: mockRelease,
      saveAsync: async () => ({ uri: uri + '.jpg' }),
    }),
  }));
});
test('Photos prepares compatible compressed videos and preserves their MIME/duration', async () => {
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [movie] });
  await expect(imageSelection()).resolves.toEqual({
    uri: movie.uri,
    name: movie.fileName,
    mime: movie.mimeType,
    duration: 2.5,
  });
  expect(mockLibrary).toHaveBeenCalledWith(
    expect.objectContaining({
      mediaTypes: ['images', 'videos'],
      videoExportPreset: 2,
      shouldDownloadFromNetwork: true,
    }),
  );
  expect(mockManipulate).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
});
test('multiple photos and a video preserve selection order and release decoded photo resources', async () => {
  mockLibrary.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { type: 'image', uri: 'file:///cache/one.png', width: 3000, height: 4000 },
      movie,
      { type: 'image', uri: 'file:///cache/two.png', width: 4000, height: 3000 },
    ],
  });
  const selection = await imageSelections();
  expect(selection.map((item) => item.uri)).toEqual([
    'file:///cache/one.png.jpg',
    movie.uri,
    'file:///cache/two.png.jpg',
  ]);
  expect(mockLibrary).toHaveBeenCalledWith(
    expect.objectContaining({
      allowsMultipleSelection: true,
      selectionLimit: 10,
      orderedSelection: true,
    }),
  );
  expect(mockRelease).toHaveBeenCalledTimes(4);
  expect(mockDelete.mock.calls.flat()).toEqual(['file:///cache/one.png', 'file:///cache/two.png']);
});
test('cancellation returns no files and camera selection remains single with compressed video settings', async () => {
  mockLibrary.mockResolvedValueOnce({ canceled: true, assets: null });
  await expect(imageSelections()).resolves.toEqual([]);
  mockPermission.mockResolvedValueOnce({ granted: true });
  mockCamera.mockResolvedValueOnce({ canceled: false, assets: [movie] });
  await expect(imageSelections(true)).resolves.toHaveLength(1);
  expect(mockCamera).toHaveBeenCalledWith(
    expect.objectContaining({ videoExportPreset: 2, videoQuality: 1 }),
  );
  expect(mockCamera.mock.calls[0][0]).not.toHaveProperty('allowsMultipleSelection');
});
test('a failed conversion cleans already prepared copies and all picker originals, without returning a partial selection', async () => {
  mockLibrary.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { type: 'image', uri: 'file:///cache/one.png', width: 10, height: 10 },
      { type: 'image', uri: 'file:///cache/bad.png', width: 10, height: 10 },
      movie,
    ],
  });
  mockManipulate
    .mockImplementationOnce(() => ({
      resize: jest.fn(),
      release: mockRelease,
      renderAsync: async () => ({
        release: mockRelease,
        saveAsync: async () => ({ uri: 'file:///cache/prepared.jpg' }),
      }),
    }))
    .mockImplementationOnce(() => ({
      resize: jest.fn(),
      release: mockRelease,
      renderAsync: async () => {
        throw new Error('decode');
      },
    }));
  await expect(imageSelections()).rejects.toThrow('MEDIA_PICKER_FAILED');
  expect(mockDelete.mock.calls.flat()).toEqual(
    expect.arrayContaining([
      'file:///cache/prepared.jpg',
      'file:///cache/one.png',
      'file:///cache/bad.png',
      movie.uri,
    ]),
  );
});
test('iCloud or export errors become a specific picker error; unavailable video duration is omitted', async () => {
  mockLibrary.mockRejectedValueOnce(new Error('FailedToReadVideoException'));
  await expect(imageSelections()).rejects.toThrow('MEDIA_PICKER_FAILED');
  mockLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ ...movie, duration: NaN }] });
  expect((await imageSelections())[0]).not.toHaveProperty('duration');
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
