import { Platform } from 'react-native';
import { AudioSession, registerGlobals } from '@livekit/react-native';
import { mediaDevices } from '@livekit/react-native-webrtc';
import { RepositoryError } from '@/services/repository';
registerGlobals();
export const supportsAudioRoute = true;
export async function requestCallMedia(video: boolean) {
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true, video });
    const tracks = stream.getTracks();
    const complete =
      tracks.some((track) => track.kind === 'audio') &&
      (!video || tracks.some((track) => track.kind === 'video'));
    tracks.forEach((track) => track.stop());
    // The native SDK may omit a denied constraint and still return the other track.
    if (!complete) throw new RepositoryError('PERMISSION_REQUIRED');
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    if (
      error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      typeof error.name === 'string' &&
      ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)
    )
      throw new RepositoryError('PERMISSION_REQUIRED');
    throw new RepositoryError('UNAVAILABLE');
  }
}
export async function startCallAudio(video: boolean) {
  await AudioSession.configureAudio({
    ios: { defaultOutput: video ? 'speaker' : 'earpiece' },
    android: {
      preferredOutputList: [
        'bluetooth',
        'headset',
        video ? 'speaker' : 'earpiece',
        video ? 'earpiece' : 'speaker',
      ],
      audioTypeOptions: { audioMode: 'inCommunication', manageAudioFocus: true },
    },
  });
  await AudioSession.startAudioSession();
}
export async function stopCallAudio() {
  await AudioSession.stopAudioSession();
}
export async function selectCallSpeaker(speaker: boolean) {
  const output =
    Platform.OS === 'ios'
      ? speaker
        ? 'force_speaker'
        : 'default'
      : speaker
        ? 'speaker'
        : 'earpiece';
  if (!(await AudioSession.getAudioOutputs()).includes(output))
    throw new RepositoryError('UNAVAILABLE');
  await AudioSession.selectAudioOutput(output);
}
