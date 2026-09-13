import { pickContactCode } from '@/messenger/pick-contact-code';
const mockPicker = jest.fn(),
  mockDecode = jest.fn(),
  mockDiscard = jest.fn();
jest.mock('expo-camera', () => ({ scanFromURLAsync: (...args: unknown[]) => mockDecode(...args) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockPicker(...args),
}));
jest.mock('@/features/chats/media-files', () => ({
  discardCachedMedia: (...args: unknown[]) => mockDiscard(...args),
}));
const valid = 'https://mnelo.com/invite#v1:' + 'ab'.repeat(32) + ':4e696e6f';
beforeEach(() => {
  mockPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/qr.jpg' }] });
  mockDecode.mockResolvedValue([{ data: valid }]);
});
test('reads the selected local image as QR and cleans its temporary copy', async () => {
  expect(await pickContactCode()).toEqual({ cancelled: false, data: valid });
  expect(mockDecode).toHaveBeenCalledWith('file:///cache/qr.jpg', ['qr']);
  expect(mockPicker).toHaveBeenCalledWith(
    expect.objectContaining({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
    }),
  );
  expect(mockDiscard).toHaveBeenCalledWith('file:///cache/qr.jpg');
});
test('cancel does not decode anything', async () => {
  mockPicker.mockResolvedValue({ canceled: true });
  expect(await pickContactCode()).toEqual({ cancelled: true });
  expect(mockDecode).not.toHaveBeenCalled();
});
test('decoder failure still cleans the selected copy', async () => {
  mockDecode.mockRejectedValueOnce(new Error('decode failed'));
  await expect(pickContactCode()).rejects.toThrow('decode failed');
  expect(mockDiscard).toHaveBeenCalledWith('file:///cache/qr.jpg');
});
test.each([
  [],
  [{ data: 'https://example.com' }],
  [{ data: valid }, { data: valid.replace('ab'.repeat(32), 'cd'.repeat(32)) }],
])('rejects empty, foreign or ambiguous codes: %j', async (...codes) => {
  // Jest spreads array rows; reconstruct the result array.
  mockDecode.mockResolvedValue(codes);
  expect(await pickContactCode()).toEqual({ cancelled: false, data: null });
});
test('remote image URLs never reach the decoder', async () => {
  mockPicker.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'https://example.com/image.jpg' }],
  });
  expect(await pickContactCode()).toEqual({ cancelled: false, data: null });
  expect(mockDecode).not.toHaveBeenCalled();
});
