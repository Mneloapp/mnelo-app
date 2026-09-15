import { useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { formatDate, formatTime } from '@/i18n/format';
import { theme } from '@/theme/tokens';
import type { LocalCall } from '../model';
import { callOutcomeCopy } from '../call-record';
import { IconButton } from '@/components/ui';

export function CallHistoryRow({
  call,
  avatar,
  onPress,
  onInfo,
  now,
}: {
  call: LocalCall;
  avatar: ReactNode;
  onPress: () => void;
  onInfo?: () => void;
  now?: number;
}) {
  const [mountedAt] = useState(Date.now);
  const referenceTime = now ?? mountedAt;
  const { t, i18n } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const missed = call.status === 'missed';
  const color = missed ? theme.colors.error : theme.colors.textSecondaryOnSoft;
  const direction =
    call.direction === 'unknown'
      ? t(call.media === 'video' ? 'messenger.callVideo' : 'messenger.callVoice')
      : t(
          call.direction === 'incoming'
            ? 'messenger.callDirectionIncoming'
            : 'messenger.callDirectionOutgoing',
        );
  const detail =
    call.status === 'ended'
      ? direction
      : `${direction} · ${t(call.status === 'failed' ? 'messenger.callStatusFailed' : callOutcomeCopy[call.status])}`;
  const date = new Date(call.endedAt);
  const locale = i18n.language.startsWith('ka') ? 'ka-GE' : 'en';
  const sameDay = date.toDateString() === new Date(referenceTime).toDateString();
  const stamp = sameDay
    ? formatTime(date.toISOString())
    : new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== new Date(referenceTime).getFullYear()
          ? { year: 'numeric' as const }
          : {}),
      }).format(date);
  return (
    <View style={styles.row}>
      <FocusPressable
        style={styles.call}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${call.name}. ${detail}. ${formatDate(date.toISOString())}, ${formatTime(date.toISOString())}`}
      >
        {avatar}
        <View style={styles.content}>
          <View style={styles.summary}>
            <AppText
              variant="bodyMedium"
              numberOfLines={fontScale > 1.3 ? undefined : 1}
              style={missed && styles.missed}
            >
              {call.name}
            </AppText>
            <View style={styles.detail}>
              <AppIcon
                name={
                  call.direction === 'incoming'
                    ? 'phone-incoming'
                    : call.direction === 'outgoing'
                      ? 'phone-outgoing'
                      : 'phone'
                }
                size={theme.icons.sm}
                color={color}
              />
              {call.media === 'video' && (
                <AppIcon name="video" size={theme.icons.sm} color={color} />
              )}
              <AppText variant="caption" style={[styles.description, { color }]}>
                {detail}
              </AppText>
            </View>
          </View>
          <AppText variant="caption" tone="secondary" style={styles.stamp}>
            {stamp}
          </AppText>
        </View>
      </FocusPressable>
      {onInfo && (
        <IconButton
          icon="info"
          label={t('messenger.callInformation', { name: call.name })}
          onPress={onInfo}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  call: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.minTapTarget,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: theme.controls.borderWidth,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  summary: { flex: 1, minWidth: 0 },
  stamp: { flexShrink: 0, maxWidth: '30%', textAlign: 'right' },
  missed: { color: theme.colors.error },
  detail: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  description: { flex: 1 },
});
