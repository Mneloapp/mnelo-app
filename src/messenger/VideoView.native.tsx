import { RTCView, type MediaStream as NativeStream } from '@livekit/react-native-webrtc';
export function VideoView({
  stream,
  local = false,
  fit = 'cover',
  mirror = local,
}: {
  stream: MediaStream;
  local?: boolean;
  fit?: 'cover' | 'contain';
  mirror?: boolean;
}) {
  return (
    <RTCView
      streamURL={(stream as unknown as NativeStream).toURL()}
      mirror={mirror}
      zOrder={local ? 1 : 0}
      objectFit={fit}
      style={{ flex: 1 }}
    />
  );
}
