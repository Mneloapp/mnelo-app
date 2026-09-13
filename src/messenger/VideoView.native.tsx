import { RTCView, type MediaStream as NativeStream } from '@livekit/react-native-webrtc';
export function VideoView({ stream, local = false }: { stream: MediaStream; local?: boolean }) {
  return (
    <RTCView
      streamURL={(stream as unknown as NativeStream).toURL()}
      mirror={local}
      zOrder={local ? 1 : 0}
      objectFit="cover"
      style={{ flex: 1 }}
    />
  );
}
