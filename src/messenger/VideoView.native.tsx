import { useRef } from 'react';
import { connectionTiming } from './connection-timing';
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
  const firstFrame = useRef(false);
  return (
    <RTCView
      // Native streamURL binds the video track only when the prop is set.
      // Audio can arrive first on the same stream URL; bind again when its
      // video track appears instead of leaving an audio-only renderer mounted.
      key={stream
        .getVideoTracks()
        .map((track) => track.id)
        .join(':')}
      streamURL={(stream as unknown as NativeStream).toURL()}
      onDimensionsChange={({ nativeEvent }) => {
        // Ignore the native renderer's 2x2 clearing frame.
        if (!firstFrame.current && nativeEvent.width > 2 && nativeEvent.height > 2) {
          firstFrame.current = true;
          connectionTiming(local ? 'LOCAL_VIDEO_FRAME' : 'REMOTE_VIDEO_FRAME');
        }
      }}
      mirror={mirror}
      zOrder={local ? 1 : 0}
      objectFit={fit}
      style={{ flex: 1 }}
    />
  );
}
