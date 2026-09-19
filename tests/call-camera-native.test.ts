import { NativeModules } from 'react-native';
import { switchCallCamera } from '@/messenger/call-platform.native';
import type NativeTrack from '@livekit/react-native-webrtc/lib/typescript/MediaStreamTrack';

jest.mock('react-native', () => {
  const original = jest.requireActual('react-native');
  original.NativeModules.WebRTCModule = {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    mediaStreamTrackApplyConstraints: jest.fn(),
    mediaStreamTrackSetEnabled: jest.fn(),
  };
  return original;
});
jest.mock('@/messenger/system-calls', () => ({}));
jest.mock('@livekit/react-native', () => ({ AudioSession: {} }));
jest.mock('@livekit/react-native-webrtc', () => ({}));

// Exercise the installed SDK's real normalization, settings update and Promise.
const Track = jest.requireActual('@livekit/react-native-webrtc/lib/commonjs/MediaStreamTrack')
  .default as typeof NativeTrack;
const bridge = NativeModules.WebRTCModule;
function track(options: { remote?: boolean; enabled?: boolean; ended?: boolean } = {}) {
  return new Track({
    id: 'local-camera',
    kind: 'video',
    remote: options.remote ?? false,
    enabled: options.enabled ?? true,
    readyState: options.ended ? 'ended' : 'live',
    peerConnectionId: -1,
    constraints: { deviceId: 'front', width: 640, height: 480, frameRate: 24, facingMode: 'user' },
    settings: { deviceId: 'front', width: 640, height: 480, frameRate: 24, facingMode: 'user' },
  });
}
function stream(video: NativeTrack | undefined) {
  return { getVideoTracks: () => (video ? [video] : []) } as unknown as MediaStream;
}
beforeEach(() => {
  bridge.mediaStreamTrackApplyConstraints.mockReset();
});
test('camera switch waits for native completion and preserves track, dimensions, frame rate and disabled state', async () => {
  const video = track({ enabled: false });
  let finish!: (settings: object) => void;
  bridge.mediaStreamTrackApplyConstraints.mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  let completed = false;
  const switching = switchCallCamera(stream(video)).then(() => (completed = true));
  await Promise.resolve();
  expect(completed).toBe(false);
  expect(bridge.mediaStreamTrackApplyConstraints).toHaveBeenCalledWith('local-camera', {
    width: 640,
    height: 480,
    frameRate: 24,
    facingMode: 'environment',
  });
  finish({ width: 640, height: 480, frameRate: 24, facingMode: 'environment', deviceId: 'back' });
  await switching;
  expect(video.enabled).toBe(false);
  expect(video.id).toBe('local-camera');
  expect(video.getSettings().facingMode).toBe('environment');
  expect(bridge.mediaStreamTrackSetEnabled).not.toHaveBeenCalled();
  bridge.mediaStreamTrackApplyConstraints.mockResolvedValueOnce({ facingMode: 'user' });
  await switchCallCamera(stream(video));
  expect(bridge.mediaStreamTrackApplyConstraints).toHaveBeenLastCalledWith('local-camera', {
    width: 640,
    height: 480,
    frameRate: 24,
    facingMode: 'user',
  });
});
test('native camera errors are awaited and do not change the current settings', async () => {
  const video = track();
  bridge.mediaStreamTrackApplyConstraints.mockRejectedValueOnce(new Error('Camera unavailable'));
  await expect(switchCallCamera(stream(video))).rejects.toThrow('Camera unavailable');
  expect(video.getSettings().facingMode).toBe('user');
  expect(video.enabled).toBe(true);
});
test('a native implementation that silently keeps the front camera is not reported successful', async () => {
  const video = track();
  bridge.mediaStreamTrackApplyConstraints.mockResolvedValueOnce(video.getSettings());
  await expect(switchCallCamera(stream(video))).rejects.toThrow('CAMERA_UNAVAILABLE');
});
test.each(['missing', 'remote', 'ended'] as const)(
  'does not change %s video tracks',
  async (state) => {
    const video =
      state === 'missing'
        ? undefined
        : track({ remote: state === 'remote', ended: state === 'ended' });
    await expect(switchCallCamera(stream(video))).rejects.toThrow('CAMERA_UNAVAILABLE');
    expect(bridge.mediaStreamTrackApplyConstraints).not.toHaveBeenCalled();
  },
);
