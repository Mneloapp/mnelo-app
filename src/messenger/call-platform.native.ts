import { systemCallAudio, systemCallSpeaker } from './system-calls';
import { Platform } from 'react-native';
import {
  mediaDevices,
  MediaStream as NativeMediaStream,
  type MediaStream as NativeStream,
} from '@livekit/react-native-webrtc';
import { AudioSession } from '@livekit/react-native';
export async function captureCall(video: boolean, group = false): Promise<MediaStream> {
  const stream = await mediaDevices.getUserMedia({
    audio: true,
    video: video
      ? {
          facingMode: 'user',
          width: group ? 480 : 640,
          height: group ? 360 : 480,
          frameRate: group ? 15 : 24,
        }
      : false,
  });
  if (!stream.getAudioTracks().length || (video && !stream.getVideoTracks().length)) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('CALL_PERMISSION_REQUIRED');
  }
  try {
    if (!systemCallAudio() || Platform.OS === 'ios')
      await AudioSession.configureAudio({
        ios: { defaultOutput: video || group ? 'speaker' : 'earpiece' },
        android: {
          preferredOutputList: ['bluetooth', 'headset', video || group ? 'speaker' : 'earpiece'],
          audioTypeOptions: { audioMode: 'inCommunication', manageAudioFocus: true },
        },
      });
    if (!systemCallAudio()) await AudioSession.startAudioSession();
    return stream as unknown as MediaStream;
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (!systemCallAudio()) await AudioSession.stopAudioSession().catch(() => undefined);
    throw error;
  }
}
export async function stopCallAudio() {
  if (!systemCallAudio()) await AudioSession.stopAudioSession();
}
export async function speakerOutput(enabled: boolean) {
  if (await systemCallSpeaker(enabled)) return;
  const outputs = await AudioSession.getAudioOutputs();
  const desired = outputs.includes('force_speaker')
    ? enabled
      ? 'force_speaker'
      : 'default'
    : enabled
      ? 'speaker'
      : 'earpiece';
  if (!outputs.includes(desired)) throw new Error('AUDIO_ROUTE_UNAVAILABLE');
  await AudioSession.selectAudioOutput(desired);
}
export async function switchCallCamera(stream: MediaStream) {
  const native = stream as unknown as NativeStream;
  const track = native.getVideoTracks()[0];
  if (!track) throw new Error('CAMERA_UNAVAILABLE');
  await track._switchCamera();
}

export function callOutputStream(local: MediaStream, screen: MediaStream): MediaStream {
  return new NativeMediaStream([
    ...local.getAudioTracks(),
    ...screen.getVideoTracks(),
  ] as never) as unknown as MediaStream;
}
