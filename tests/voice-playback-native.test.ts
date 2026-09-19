import {
  beginVoicePlayback,
  voicePlaybackKeepsSessionActive,
} from '@/features/chats/voice-playback.native';
jest.mock('expo-modules-core', () => {
  const listeners = new Set<(mockEvent: { token: string }) => void>();
  const bridge = {
    beginVoicePlayback: jest.fn(async (_token: string) => true),
    endVoicePlayback: jest.fn(async (_token: string) => {}),
    addListener: jest.fn((_name: string, callback: (mockEvent: { token: string }) => void) => {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    }),
  };
  return {
    ...jest.requireActual('expo-modules-core'),
    requireOptionalNativeModule: () => bridge,
    testVoiceBridge: bridge,
    testVoiceListeners: listeners,
  };
});
const mockBridge = jest.requireMock('expo-modules-core').testVoiceBridge;
const listeners: Set<(mockEvent: { token: string }) => void> =
  jest.requireMock('expo-modules-core').testVoiceListeners;
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
beforeEach(() => {
  mockBridge.beginVoicePlayback.mockResolvedValue(true);
  listeners.clear();
});
test('native lease bypasses ambient mode and disables Expo delayed deactivation', async () => {
  const interrupted = jest.fn();
  const lease = await beginVoicePlayback(interrupted);
  expect(voicePlaybackKeepsSessionActive).toBe(true);
  expect(mockBridge.beginVoicePlayback).toHaveBeenCalledWith(
    '00000000-0000-4000-8000-000000000001',
  );
  expect(jest.requireMock('expo-audio').setAudioModeAsync).not.toHaveBeenCalled();
  expect(lease.active()).toBe(true);
  for (const listener of listeners) listener({ token: 'different-player' });
  expect(interrupted).not.toHaveBeenCalled();
  for (const listener of listeners) listener({ token: '00000000-0000-4000-8000-000000000001' });
  expect(lease.active()).toBe(false);
  expect(interrupted).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
});
test('CallKit refusal cleans up the provisional listener and never grants a playback lease', async () => {
  mockBridge.beginVoicePlayback.mockResolvedValueOnce(false);
  await expect(beginVoicePlayback(jest.fn())).rejects.toThrow('AUDIO_ROUTE_UNAVAILABLE');
  expect(listeners.size).toBe(0);
  expect(mockBridge.endVoicePlayback).toHaveBeenCalledTimes(1);
});
test('release stops only its own native lease and removes proximity interruption listener', async () => {
  const lease = await beginVoicePlayback(jest.fn());
  await lease.stop();
  expect(lease.active()).toBe(false);
  expect(listeners.size).toBe(0);
  expect(mockBridge.endVoicePlayback).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
});
