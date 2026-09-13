import { useEffect, useRef } from 'react';
export function VideoView({ stream, local = false }: { stream: MediaStream; local?: boolean }) {
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
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
