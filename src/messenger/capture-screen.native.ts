import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { mediaDevices } from '@livekit/react-native-webrtc';
import { waitForCapture, type ScreenCapture } from './screen-capture';
type NativeShare = {
  prepareScreenShare(id: string): Promise<string>;
  presentScreenShare(token: string): Promise<void>;
  screenShareActive(token: string): Promise<boolean>;
  stopScreenShare(token: string): Promise<void>;
};
const native = requireOptionalNativeModule<NativeShare>('MneloCalls');
export async function captureScreen(id: string, signal: AbortSignal): Promise<ScreenCapture> {
  let stream: MediaStream | undefined;
  let token: string | undefined;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    stream?.getTracks().forEach((track) => track.stop());
    if (token) void native?.stopScreenShare(token).catch(() => undefined);
    signal.removeEventListener('abort', stop);
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    if (signal.aborted) throw new Error('SCREEN_SHARE_CANCELLED');
    if (Platform.OS === 'ios') {
      if (!native?.prepareScreenShare) throw new Error('SCREEN_SHARE_UNAVAILABLE');
      token = await native.prepareScreenShare(id);
      if (signal.aborted) {
        await native.stopScreenShare(token);
        throw new Error('SCREEN_SHARE_CANCELLED');
      }
    }
    stream = (await mediaDevices.getDisplayMedia()) as unknown as MediaStream;
    if (signal.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('SCREEN_SHARE_CANCELLED');
    }
    if (Platform.OS === 'ios' && token && native) {
      await native.presentScreenShare(token);
      const deadline = Date.now() + 60000;
      while (!(await native.screenShareActive(token))) {
        if (Date.now() >= deadline) throw new Error('SCREEN_SHARE_CANCELLED');
        await waitForCapture(signal);
      }
    }
    if (!stream.getVideoTracks().length || signal.aborted)
      throw new Error('SCREEN_SHARE_CANCELLED');
    return { stream, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
