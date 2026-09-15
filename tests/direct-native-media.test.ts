import { NativeModules, Platform } from 'react-native';
import { captureCall } from '@/messenger/call-platform.native';
import { makePeer } from '@/messenger/peer-platform.native';

jest.mock('react-native', () => {
  const original = jest.requireActual('react-native');
  const native: Record<string, unknown> = {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    active: Array(6).fill(true),
  };
  [
    'EngineCreated',
    'WillEnableEngine',
    'WillStartEngine',
    'DidStopEngine',
    'DidDisableEngine',
    'WillReleaseEngine',
  ].forEach((hook, i) => {
    native[`audioDeviceModuleSet${hook}Active`] = (active: boolean) => {
      (native.active as boolean[])[i] = active;
    };
  });
  original.NativeModules.WebRTCModule = native;
  return original;
});
jest.mock('@/messenger/system-calls', () => ({
  systemCallAudio: () => true,
  prepareSystemCallAudio: jest.fn(async () => true),
  systemCallSpeaker: jest.fn(async () => true),
}));
jest.mock('@livekit/react-native', () => ({
  AudioSession: { configureAudio: jest.fn(), startAudioSession: jest.fn() },
}));
jest.mock('@livekit/react-native-webrtc', () => {
  // Use the installed library's real lifecycle reconciler. Native callbacks
  // start active, exactly as AudioDeviceModuleObserver does on an iPhone.
  const { audioDeviceModuleEvents } = jest.requireActual(
    '@livekit/react-native-webrtc/lib/commonjs/AudioDeviceModuleEvents',
  );
  const { NativeModules, Platform } = jest.requireMock('react-native');
  const assertReady = () => {
    if (Platform.OS === 'ios' && NativeModules.WebRTCModule.active.some(Boolean))
      throw new Error('Native audio thread would wait for unhandled lifecycle callbacks');
  };
  const track = { kind: 'audio', stop: jest.fn() };
  return {
    audioDeviceModuleEvents,
    mediaDevices: {
      getUserMedia: jest.fn(async () => {
        assertReady();
        return {
          getAudioTracks: () => [track],
          getVideoTracks: () => [],
          getTracks: () => [track],
        };
      }),
    },
    RTCPeerConnection: jest.fn().mockImplementation(() => {
      assertReady();
      return { close: jest.fn() };
    }),
  };
});

beforeEach(() => {
  NativeModules.WebRTCModule.active.fill(true);
});

test('direct iOS capture initializes every audio lifecycle hook before opening the microphone', async () => {
  await expect(captureCall(false)).resolves.toBeDefined();
  expect(NativeModules.WebRTCModule.active).toEqual(Array(6).fill(false));
  const { AudioSession } = jest.requireMock('@livekit/react-native');
  expect(AudioSession.configureAudio).not.toHaveBeenCalled();
  expect(AudioSession.startAudioSession).not.toHaveBeenCalled();
});

test('peer negotiation also initializes hooks and reconciles a recreated native observer', () => {
  expect(makePeer({ iceServers: [], iceTransportPolicy: 'relay' })).toBeDefined();
  NativeModules.WebRTCModule.active.fill(true);
  expect(makePeer({ iceServers: [], iceTransportPolicy: 'relay' })).toBeDefined();
  expect(NativeModules.WebRTCModule.active).toEqual(Array(6).fill(false));
});

test('Android capture does not invoke the iOS-only lifecycle bridge', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  try {
    await expect(captureCall(false)).resolves.toBeDefined();
    expect(NativeModules.WebRTCModule.active).toEqual(Array(6).fill(true));
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
});
