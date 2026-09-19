import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { setAudioModeAsync } from 'expo-audio';
import { reserveVoicePlayback, type VoicePlaybackLease } from './voice-session';
export type { VoicePlaybackLease } from './voice-session';
type NativeVoice = {
  beginVoicePlayback?(token: string): Promise<boolean>;
  endVoicePlayback?(token: string): Promise<void>;
  addListener(
    event: 'voicePlaybackStopped',
    listener: (event: { token: string }) => void,
  ): { remove(): void };
};
const native = requireOptionalNativeModule<NativeVoice>('MneloCalls');
export const voicePlaybackKeepsSessionActive =
  Platform.OS === 'ios' && Boolean(native?.beginVoicePlayback);
export function beginVoicePlayback(interrupted: () => void): Promise<VoicePlaybackLease> {
  return reserveVoicePlayback(interrupted, prepareVoicePlayback);
}
async function prepareVoicePlayback(interrupted: () => void): Promise<VoicePlaybackLease> {
  if (!voicePlaybackKeepsSessionActive) {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    let active = true;
    return {
      active: () => active,
      stop: () => {
        active = false;
      },
    };
  }
  const bridge = native!;
  const token = randomUUID();
  let active = true;
  const listener = bridge.addListener('voicePlaybackStopped', (event) => {
    if (event.token !== token || !active) return;
    active = false;
    listener.remove();
    interrupted();
  });
  const stop = () => {
    active = false;
    listener.remove();
    return bridge.endVoicePlayback?.(token).catch(() => undefined);
  };
  try {
    if (!(await bridge.beginVoicePlayback!(token))) throw new Error('AUDIO_ROUTE_UNAVAILABLE');
    return { active: () => active, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
