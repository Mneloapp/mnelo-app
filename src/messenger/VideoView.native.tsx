import { RTCView, type MediaStream as NativeStream } from '@livekit/react-native-webrtc';
export function VideoView({ stream, local = false }: { stream: MediaStream; local?: boolean }) {
  return (
    <RTCView
      streamURL={(stream as unknown as NativeStream).toURL()}
      mirror={local}
      objectFit="cover"
      style={{ flex: 1 }}
    />
  );
}
