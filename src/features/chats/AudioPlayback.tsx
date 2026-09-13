import { useAction } from '@/hooks/useAction';
import { useEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppState, View, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton, ui } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import { VoiceWaveform } from './VoiceWaveform';
import { voiceTime } from './voice-waveform';
export function AudioPlayback({
  uri,
  resolveUri,
  durationSeconds = 0,
  waveform,
  disabled = false,
}: {
  uri: string;
  resolveUri?: () => Promise<string>;
  durationSeconds?: number;
  waveform?: readonly number[];
  disabled?: boolean;
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
    active.current = focused && !disabled && AppState.currentState === 'active';
    if (!active.current) player.pause();
    const sub = AppState.addEventListener('change', (s) => {
      active.current = focused && !disabled && s === 'active';
      if (!active.current) player.pause();
    });
    return () => {
      active.current = false;
      sub.remove();
    };
  }, [player, focused, disabled]);
  return (
    <View style={ui.stack}>
      <View style={[styles.player, waveform && styles.compact]}>
        <IconButton
          variant="soft"
          icon={status.playing ? 'pause' : 'play'}
          label={t(status.playing ? 'media.pause' : 'media.play')}
          busy={action.busy}
          disabled={disabled}
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
        {waveform ? (
          <>
            <VoiceWaveform samples={waveform} progress={progress} />
            <AppText
              variant="label"
              style={styles.time}
              accessibilityLabel={t('media.playbackTime', {
                current: Math.floor(status.currentTime),
                duration: Math.ceil(duration),
              })}
            >
              {voiceTime(status.playing || status.currentTime > 0 ? status.currentTime : duration)}
            </AppText>
          </>
        ) : (
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
        )}
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
  compact: { minWidth: 0, gap: theme.spacing.sm, paddingRight: theme.spacing.md },
  time: { fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'right' },
});
