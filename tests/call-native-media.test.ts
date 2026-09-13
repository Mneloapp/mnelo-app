import { requestCallMedia } from '@/features/calls/runtime.native';
const mockCapture = jest.fn();
jest.mock('@livekit/react-native', () => ({ registerGlobals: jest.fn(), AudioSession: {} }));
jest.mock('@livekit/react-native-webrtc', () => ({
  mediaDevices: { getUserMedia: (...args: unknown[]) => mockCapture(...args) },
}));
test.each(['SecurityError', 'NotAllowedError', 'PermissionDeniedError'])(
  'native non-Error %s receives permission guidance',
  async (name) => {
    mockCapture.mockRejectedValueOnce({ name, message: 'Native provider detail is not shown' });
    await expect(requestCallMedia(false)).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
  },
);
test.each(['audio', 'video'])(
  'partial native permission never authorizes video with only %s',
  async (kind) => {
    const track = { kind, stop: jest.fn() };
    mockCapture.mockResolvedValueOnce({ getTracks: () => [track] });
    await expect(requestCallMedia(true)).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    expect(track.stop).toHaveBeenCalledTimes(1);
  },
);
test('successful consent preflight releases every captured track', async () => {
  const tracks = ['audio', 'video'].map((kind) => ({ kind, stop: jest.fn() }));
  mockCapture.mockResolvedValueOnce({ getTracks: () => tracks });
  await expect(requestCallMedia(true)).resolves.toBeUndefined();
  for (const track of tracks) expect(track.stop).toHaveBeenCalledTimes(1);
});
test('hardware failures remain unavailable rather than being misreported as permission denial', async () => {
  mockCapture.mockRejectedValueOnce({ name: 'NotReadableError' });
  await expect(requestCallMedia(false)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});
