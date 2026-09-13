import jpeg from 'jpeg-js';
import { pickProfilePhoto } from '@/messenger/pick-profile-photo';
const mockSelect = jest.fn();
const mockSave = jest.fn();
const mockResize = jest.fn();
const mockImageRelease = jest.fn();
const mockContextRelease = jest.fn();
const mockRemove = jest.fn();
const mockRender = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockSelect(...args),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: mockResize,
      renderAsync: mockRender,
      release: mockContextRelease,
    }),
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///app/cache/' } },
  File: class {
    exists = true;
    uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
    }
    delete() {
      mockRemove(this.uri);
    }
  },
}));
const photo = Buffer.from(
  jpeg.encode({ width: 4, height: 4, data: Buffer.alloc(64, 255) }, 60).data,
).toString('base64');
beforeEach(() => {
  mockSelect.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///photos/original.jpg', width: 2000, height: 1000 }],
  });
  mockRender.mockResolvedValue({ saveAsync: mockSave, release: mockImageRelease });
  mockSave.mockResolvedValue({ uri: 'file:///app/cache/resized.jpg', base64: photo });
});
test('cancel does not manipulate or delete anything', async () => {
  mockSelect.mockResolvedValue({ canceled: true, assets: [] });
  expect(await pickProfilePhoto()).toBeNull();
  expect(mockRender).not.toHaveBeenCalled();
  expect(mockRemove).not.toHaveBeenCalled();
});
test('resizes to bounded JPEG, removes generated file and preserves the library original', async () => {
  expect(await pickProfilePhoto()).toBe(photo);
  expect(mockSelect).toHaveBeenCalledWith(
    expect.objectContaining({ exif: false, mediaTypes: ['images'] }),
  );
  expect(mockResize).toHaveBeenCalledWith({ width: 320 });
  expect(mockRemove.mock.calls).toEqual([['file:///app/cache/resized.jpg']]);
  expect(mockImageRelease).toHaveBeenCalled();
  expect(mockContextRelease).toHaveBeenCalled();
});
test('failed rendering releases its native context and cleans only the picker cache copy', async () => {
  mockSelect.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///app/cache/ImagePicker/fixture.jpg', width: 2000, height: 1000 }],
  });
  mockRender.mockRejectedValue(new Error('invalid image'));
  await expect(pickProfilePhoto()).rejects.toThrow('invalid image');
  expect(mockContextRelease).toHaveBeenCalled();
  expect(mockRemove).toHaveBeenCalledWith('file:///app/cache/ImagePicker/fixture.jpg');
});
test('oversized encodings cannot be saved and every compression attempt is cleaned', async () => {
  mockSave.mockResolvedValue({ uri: 'file:///app/cache/resized.jpg', base64: 'x'.repeat(48001) });
  await expect(pickProfilePhoto()).rejects.toThrow('PROFILE_PHOTO_TOO_LARGE');
  expect(mockSave).toHaveBeenCalledTimes(3);
  expect(mockRemove).toHaveBeenCalledTimes(3);
});
