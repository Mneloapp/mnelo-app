import { useAction } from '@/hooks/useAction';
import { useEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppState, View, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton, ui } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
export function AudioPlayback({
  uri,
  resolveUri,
  durationSeconds = 0,
}: {
  uri: string;
  resolveUri?: () => Promise<string>;
  durationSeconds?: number;
}) {
  const { t } = useTranslation();
  // Mounting a voice bubble must not download its recording. Resolve private access on Play.
  const player = useAudioPlayer(null);
  const action = useAction();
  const active = useRef(false);
  const status = useAudioPlayerStatus(player);
  const focused = useIsFocused();
  const duration = status.duration || durationSeconds;
  const progress = duration > 0 ? Math.min(1, Math.max(0, status.currentTime / duration)) : 0;
  useEffect(() => {
    active.current = focused && AppState.currentState === 'active';
    if (!active.current) player.pause();
    const sub = AppState.addEventListener('change', (s) => {
      active.current = focused && s === 'active';
      if (!active.current) player.pause();
    });
    return () => {
      active.current = false;
      sub.remove();
    };
  }, [player, focused]);
  return (
    <View style={ui.stack}>
      <View style={styles.player}>
        <IconButton
          variant="soft"
          icon={status.playing ? 'pause' : 'play'}
          label={t(status.playing ? 'media.pause' : 'media.play')}
          busy={action.busy}
          onPress={() =>
            void action.run(async () => {
              if (status.playing) {
                player.pause();
                return;
              }
              if (!player.isLoaded) {
                const source = resolveUri ? await resolveUri() : uri;
                if (!active.current) return;
                player.replace(source);
              }
              if (!active.current) return;
              if (
                status.didJustFinish ||
                (status.duration > 0 && status.currentTime >= status.duration)
              )
                await player.seekTo(0);
              if (active.current) player.play();
            })
          }
        />
        <View style={ui.flex}>
          <View style={styles.track} accessible={false} importantForAccessibility="no">
            <View style={[styles.progress, { width: `${progress * 100}%` }]} />
          </View>
          <AppText variant="caption">
            {t('media.playbackTime', {
              current: Math.floor(status.currentTime),
              duration: Math.ceil(status.duration || durationSeconds),
            })}
          </AppText>
        </View>
      </View>
      {action.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {action.error}
        </AppText>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minWidth: theme.avatar.large * 2,
  },
  track: {
    height: theme.controls.progressHeight,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  progress: { height: '100%', backgroundColor: theme.colors.black },
});
