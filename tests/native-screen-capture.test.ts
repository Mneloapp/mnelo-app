import { captureScreen } from '@/messenger/capture-screen.native';
import { mediaDevices } from '@livekit/react-native-webrtc';
import { requireOptionalNativeModule } from 'expo-modules-core';
jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual('expo-modules-core');
  const share = {
    prepareScreenShare: jest.fn(async () => 'token'),
    presentScreenShare: jest.fn(async () => {}),
    screenShareActive: jest.fn(async () => true),
    stopScreenShare: jest.fn(async () => {}),
  };
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      name === 'MneloCalls' ? share : actual.requireOptionalNativeModule(name),
  };
});
const mockNative = requireOptionalNativeModule<{
  prepareScreenShare: jest.Mock;
  presentScreenShare: jest.Mock;
  screenShareActive: jest.Mock;
  stopScreenShare: jest.Mock;
}>('MneloCalls')!;
jest.mock('@livekit/react-native-webrtc', () => ({ mediaDevices: { getDisplayMedia: jest.fn() } }));
function fixture() {
  const track = { stop: jest.fn() };
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream,
  };
}
beforeEach(() => jest.clearAllMocks());
test('iOS capture prepares the active call and presents system consent before returning a track; stop is idempotent', async () => {
  const f = fixture();
  jest.mocked(mediaDevices.getDisplayMedia).mockResolvedValue(f.stream as never);
  const signal = new AbortController();
  const capture = await captureScreen('call', signal.signal);
  expect(mockNative.prepareScreenShare).toHaveBeenCalledWith('call');
  expect(mockNative.presentScreenShare).toHaveBeenCalledWith('token');
  capture.stop();
  capture.stop();
  signal.abort();
  expect(f.track.stop).toHaveBeenCalledTimes(1);
  expect(mockNative.stopScreenShare).toHaveBeenCalledTimes(1);
});
test('cancelling during the native stream request stops a late track and never opens consent', async () => {
  const f = fixture();
  let resolve!: (value: never) => void;
  jest.mocked(mediaDevices.getDisplayMedia).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const signal = new AbortController();
  const pending = captureScreen('call', signal.signal);
  await Promise.resolve();
  signal.abort();
  resolve(f.stream as never);
  await expect(pending).rejects.toThrow('SCREEN_SHARE_CANCELLED');
  expect(f.track.stop).toHaveBeenCalledTimes(1);
  expect(mockNative.presentScreenShare).not.toHaveBeenCalled();
});
test('a failed system consent presentation releases the screen track and its request token', async () => {
  const f = fixture();
  jest.mocked(mediaDevices.getDisplayMedia).mockResolvedValue(f.stream as never);
  mockNative.presentScreenShare.mockRejectedValueOnce(new Error('cancelled'));
  await expect(captureScreen('call', new AbortController().signal)).rejects.toThrow('cancelled');
  expect(f.track.stop).toHaveBeenCalledTimes(1);
  expect(mockNative.stopScreenShare).toHaveBeenCalledWith('token');
});
