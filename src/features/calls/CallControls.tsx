import { RepositoryError } from '@/services/repository';
import { useState } from 'react';
import { View } from 'react-native';
import { ConnectionState, LocalVideoTrack, Track } from 'livekit-client';
import { useTranslation } from 'react-i18next';
import { useCallRoom } from './useCallRoom';
import { VideoStage } from './VideoStage';
import { selectCallSpeaker, supportsAudioRoute } from './runtime';
import { AppText } from '@/components/AppText';
import { ui } from '@/components/ui';
import { CallAction } from './CallAction';
import { useAction } from '@/hooks/useAction';
export function CallControls({ id, video }: { id: string; video: boolean }) {
  const { t } = useTranslation();
  const { room, state, failed } = useCallRoom(id, video);
  const action = useAction();
  const [speaker, setSpeaker] = useState(video);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const connected = state === ConnectionState.Connected;
  const muted = !room.localParticipant.isMicrophoneEnabled,
    camera = room.localParticipant.isCameraEnabled;
  return (
    <View style={ui.stack}>
      <AppText centered tone="secondary" accessibilityLiveRegion="polite">
        {t(
          failed
            ? 'calls.failed'
            : connected
              ? room.remoteParticipants.size
                ? 'calls.connected'
                : 'calls.waitingPeer'
              : state === ConnectionState.Reconnecting
                ? 'calls.reconnecting'
                : 'calls.connecting',
        )}
      </AppText>
      <VideoStage room={room} key={'stage'} />
      <View style={ui.horizontal}>
        <View style={ui.flex}>
          <CallAction
            icon={muted ? 'mic-off' : 'mic'}
            label={t(muted ? 'calls.unmute' : 'calls.mute')}
            disabled={!connected || action.busy}
            onPress={() =>
              void action.run(async () => {
                await room.localParticipant.setMicrophoneEnabled(muted);
              })
            }
          />
        </View>
        {supportsAudioRoute && (
          <View style={ui.flex}>
            <CallAction
              icon={speaker ? 'volume-2' : 'phone'}
              label={t(speaker ? 'calls.earpiece' : 'calls.speaker')}
              disabled={!connected || action.busy}
              onPress={() =>
                void action.run(async () => {
                  await selectCallSpeaker(!speaker);
                  setSpeaker(!speaker);
                })
              }
            />
          </View>
        )}
      </View>
      {video && (
        <View style={ui.horizontal}>
          <View style={ui.flex}>
            <CallAction
              icon={camera ? 'video' : 'video-off'}
              label={t(camera ? 'calls.cameraOff' : 'calls.cameraOn')}
              disabled={!connected || action.busy}
              onPress={() =>
                void action.run(async () => {
                  await room.localParticipant.setCameraEnabled(!camera);
                })
              }
            />
          </View>
          <View style={ui.flex}>
            <CallAction
              icon="refresh-cw"
              label={t('calls.switchCamera')}
              disabled={!connected || !camera || action.busy}
              onPress={() =>
                void action.run(async () => {
                  const next = facing === 'user' ? 'environment' : 'user';
                  const track = room.localParticipant.getTrackPublication(
                    Track.Source.Camera,
                  )?.track;
                  if (!(track instanceof LocalVideoTrack)) throw new RepositoryError('UNAVAILABLE');
                  await track.restartTrack({ facingMode: next });
                  setFacing(next);
                })
              }
            />
          </View>
        </View>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
