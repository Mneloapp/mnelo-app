import { systemCallAudio, systemCallSpeaker, prepareSystemCallAudio } from './system-calls';
import { Platform } from 'react-native';
import {
  mediaDevices,
  MediaStream as NativeMediaStream,
  type MediaStream as NativeStream,
} from '@livekit/react-native-webrtc';
import { AudioSession } from '@livekit/react-native';
import { prepareNativeWebRTC } from './native-webrtc';
import { connectionTiming } from './connection-timing';
export async function captureCall(video: boolean, group = false): Promise<MediaStream> {
  prepareNativeWebRTC();
  const audioStarted = Date.now();
  const prepared = await prepareSystemCallAudio(video || group);
  connectionTiming('CAPTURE_AUDIO_READY', Date.now() - audioStarted);
  const captureStarted = Date.now();
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
  connectionTiming('CAPTURE_STREAM_READY', Date.now() - captureStarted);
  if (!stream.getAudioTracks().length || (video && !stream.getVideoTracks().length)) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('CALL_PERMISSION_REQUIRED');
  }
  try {
    if (!systemCallAudio() || (Platform.OS === 'ios' && !prepared))
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
  if (!track || track.remote || track.readyState !== 'live') throw new Error('CAMERA_UNAVAILABLE');
  const current = track.getSettings();
  const facingMode = current.facingMode === 'environment' ? 'user' : 'environment';
  const constraints = { ...track.getConstraints(), facingMode };
  // An old deviceId would take precedence over the requested facingMode.
  delete constraints.deviceId;
  await track.applyConstraints(constraints);
  if (track.getSettings().facingMode !== facingMode) throw new Error('CAMERA_UNAVAILABLE');
}

export function callOutputStream(local: MediaStream, screen: MediaStream): MediaStream {
  return new NativeMediaStream([
    ...local.getAudioTracks(),
    ...screen.getVideoTracks(),
  ] as never) as unknown as MediaStream;
}
