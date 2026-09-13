import { useEffect, useRef } from 'react';
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
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={local}
      style={{
        width: '100%',
        height: '100%',
        objectFit: fit,
        transform: mirror ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
