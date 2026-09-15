import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { Avatar } from '@/components/ui';
import { theme } from '@/theme/tokens';
import type { DeviceCall } from '../calls';
import { VideoView } from '../VideoView';
import { PeerAvatar } from './ContactCard';
export function GroupCallStage({
  call,
  names,
  availableHeight,
}: {
  call: DeviceCall;
  names: Record<string, string>;
  availableHeight: number;
}) {
  const { t } = useTranslation();
  const people = call.participants ?? [];
  const shared = people.find(
    (person) => person.sharing && person.remote && person.status === 'active',
  );
  const presentation = shared?.remote ?? call.screen;
  const rows = Math.ceil((people.length + 1) / 2);
  const tileHeight = Math.max(110, Math.min(180, (availableHeight - 24 - (rows - 1) * 10) / rows));
  return (
    <View style={styles.stage} testID="group-call-stage">
      {presentation && (
        <View style={styles.presentation} testID="group-call-presentation">
          <VideoView stream={presentation} fit="contain" local mirror={false} />
          <AppText centered variant="caption">
            {shared ? names[shared.peer] : t('groupCall.you')} · {t('groupCall.sharing')}
          </AppText>
        </View>
      )}
      <ScrollView
        style={presentation ? styles.stripScroll : undefined}
        horizontal={Boolean(presentation)}
        contentContainerStyle={presentation ? styles.strip : styles.grid}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={[styles.tile, { height: tileHeight }, presentation && styles.smallTile]}>
          {call.local && call.camera && !call.screen ? (
            <VideoView stream={call.local} local />
          ) : (
            <View style={styles.avatar}>
              <Avatar name="" />
            </View>
          )}
          <View style={styles.label}>
            <AppText variant="caption" numberOfLines={1} style={styles.name}>
              {t('groupCall.you')}
            </AppText>
            {call.muted && <AppIcon name="mic-off" size={16} />}
          </View>
        </View>
        {people.map((person) => {
          const video =
            call.media === 'video' &&
            person.camera &&
            !person.sharing &&
            person.remote?.getVideoTracks().length;
          return (
            <View
              key={person.peer}
              style={[styles.tile, { height: tileHeight }, presentation && styles.smallTile]}
              testID="group-call-participant"
            >
              {person.remote && (
                <View style={video ? styles.video : styles.audio}>
                  <VideoView stream={person.remote} />
                </View>
              )}
              {!video && (
                <View style={styles.avatar}>
                  <PeerAvatar peer={person.peer} name={names[person.peer] ?? t('brand')} />
                </View>
              )}
              <View style={styles.label}>
                <AppText variant="caption" numberOfLines={1} style={styles.name}>
                  {names[person.peer] ?? t('brand')}
                </AppText>
                {person.muted && <AppIcon name="mic-off" size={16} />}
              </View>
              {person.status !== 'active' && (
                <AppText centered variant="caption" tone="secondary">
                  {t(
                    person.status === 'ringing' && !person.ringingConfirmed
                      ? 'calls.calling'
                      : (`groupCall.${person.status}` as const),
                  )}
                </AppText>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  stage: { flex: 1, gap: 12 },
  presentation: { flex: 1, minHeight: 140, backgroundColor: '#111111' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12 },
  strip: { gap: 10, padding: 12 },
  stripScroll: { flexGrow: 0, flexShrink: 0, height: 140 },
  tile: {
    width: '48%',
    height: 180,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#292929',
  },
  smallTile: { width: 106, height: 116 },
  avatar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  video: { flex: 1 },
  audio: { width: 1, height: 1, position: 'absolute', opacity: 0 },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 4,
    backgroundColor: 'rgba(17,17,17,0.65)',
  },
  name: { flex: 1, color: theme.colors.callText },
});
