import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { type Room, Track } from 'livekit-client';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
function MediaElement({ track, label }: { track: Track; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      aria-label={label}
      style={{
        width: '100%',
        height: '100%',
        display: track.kind === 'audio' ? 'none' : 'block',
        borderRadius: theme.radii.lg,
        objectFit: 'cover',
      }}
    />
  );
}
export function VideoStage({ room }: { room: Room }) {
  const { t } = useTranslation();
  const local = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const remote = [...room.remoteParticipants.values()].flatMap((p) =>
    [...p.trackPublications.values()].filter((pub) => pub.track && !pub.isMuted),
  );
  const video = remote.find((pub) => pub.source === Track.Source.Camera);
  const self = local?.track && !local.isMuted ? local.track : null;
  return (
    <>
      {/* Local microphone tracks must never be attached to a playback element. */}
      {remote
        .filter((pub) => pub.source === Track.Source.Microphone)
        .map((pub) => (
          <MediaElement key={pub.trackSid} track={pub.track!} label={t('calls.remoteAudio')} />
        ))}
      {(self || video) && (
        <View style={{ height: theme.layout.callVideoHeight, position: 'relative' }}>
          {video?.track && <MediaElement track={video.track} label={t('calls.remoteVideo')} />}
          {self && (
            <View
              style={{
                position: 'absolute',
                right: theme.spacing.sm,
                bottom: theme.spacing.sm,
                width: theme.layout.callSelfWidth,
                height: theme.layout.callSelfHeight,
              }}
            >
              <MediaElement track={self} label={t('calls.localVideo')} />
            </View>
          )}
        </View>
      )}
    </>
  );
}
