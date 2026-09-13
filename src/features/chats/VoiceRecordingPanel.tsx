import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';
import { VoiceWaveform } from './VoiceWaveform';
import { voiceTime } from './voice-waveform';

function RecordingLight({ active }: { active: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) {
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [active, reduced, opacity]);
  return (
    <View
      style={styles.lightHalo}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.light, { opacity }]} />
    </View>
  );
}

export function VoiceRecordingPanel({
  samples,
  seconds,
  recording,
  preparing = false,
  disabled = false,
  ready = false,
  onToggle,
  onDelete,
  onSend,
  deleteLabel,
  preview,
}: {
  samples: readonly number[];
  seconds: number;
  recording: boolean;
  preparing?: boolean;
  disabled?: boolean;
  ready?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSend?: (() => void) | undefined;
  deleteLabel: string;
  preview?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.panel}>
      <View style={styles.capsule}>
        {preview ?? (
          <View style={styles.capture}>
            <RecordingLight active={recording} />
            <AppText
              variant="label"
              style={styles.time}
              accessibilityLabel={t('media.recordedTime', { seconds: Math.floor(seconds) })}
            >
              {voiceTime(seconds)}
            </AppText>
            <VoiceWaveform samples={samples} live={recording} />
            <IconButton
              variant="soft"
              icon={recording ? 'stop' : 'mic'}
              label={t(recording ? 'media.stop' : 'media.record')}
              disabled={disabled}
              busy={preparing}
              onPress={onToggle}
            />
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <IconButton
          icon="trash-2"
          label={deleteLabel}
          disabled={disabled || preparing}
          onPress={onDelete}
        />
        <AppText variant="caption" tone="secondary" style={styles.hint}>
          {t(
            preparing
              ? 'media.preparingVoice'
              : recording
                ? 'media.recordingVoice'
                : ready
                  ? 'media.reviewVoice'
                  : 'chat.voiceMessage',
          )}
        </AppText>
        {onSend ? (
          <IconButton
            variant="accent"
            icon="send"
            label={t('common.send')}
            disabled={!ready || preparing}
            busy={disabled}
            onPress={onSend}
          />
        ) : (
          <View style={styles.spacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: theme.spacing.xs, paddingTop: theme.spacing.sm },
  capsule: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.xs,
    minHeight: 58,
  },
  capture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  time: { fontVariant: ['tabular-nums'], minWidth: 42 },
  lightHalo: {
    height: 22,
    width: 22,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  light: {
    width: 9,
    height: 13,
    borderTopLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: theme.colors.success,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  hint: { flex: 1, textAlign: 'center' },
  spacer: { width: theme.controls.minTapTarget },
});
