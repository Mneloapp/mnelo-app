import { setAudioModeAsync } from 'expo-audio';
import { reserveVoicePlayback, type VoicePlaybackLease } from './voice-session';
export type { VoicePlaybackLease } from './voice-session';
export const voicePlaybackKeepsSessionActive = false;
export function beginVoicePlayback(interrupted: () => void): Promise<VoicePlaybackLease> {
  return reserveVoicePlayback(interrupted, prepareVoicePlayback);
}
async function prepareVoicePlayback(): Promise<VoicePlaybackLease> {
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
