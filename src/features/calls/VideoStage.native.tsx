import { View } from 'react-native';
import { VideoTrack } from '@livekit/react-native';
import { type Room, Track } from 'livekit-client';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
export function VideoStage({ room }: { room: Room }) {
  const { t } = useTranslation();
  // Each direct call has one remote participant; the room grant never permits group membership.
  const remote = [...room.remoteParticipants.values()][0];
  const localPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const remotePub = remote?.getTrackPublication(Track.Source.Camera);
  const self = localPub?.track && !localPub.isMuted ? localPub : undefined;
  const video = remotePub?.track && !remotePub.isMuted ? remotePub : undefined;
  return self || video ? (
    <View style={{ height: theme.layout.callVideoHeight, position: 'relative' }}>
      {video && remote && (
        <View accessibilityLabel={t('calls.remoteVideo')}>
          <VideoTrack
            trackRef={{ participant: remote, publication: video, source: Track.Source.Camera }}
            style={{ height: theme.layout.callVideoHeight, borderRadius: theme.radii.lg }}
          />
        </View>
      )}
      {self && (
        <View
          accessibilityLabel={t('calls.localVideo')}
          style={{ position: 'absolute', right: theme.spacing.sm, bottom: theme.spacing.sm }}
        >
          <VideoTrack
            trackRef={{
              participant: room.localParticipant,
              publication: self,
              source: Track.Source.Camera,
            }}
            mirror
            style={{
              width: theme.layout.callSelfWidth,
              height: theme.layout.callSelfHeight,
              borderRadius: theme.radii.lg,
            }}
          />
        </View>
      )}
    </View>
  ) : null;
}
