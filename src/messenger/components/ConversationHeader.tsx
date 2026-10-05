import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { IconButton } from '@/components/ui';
import { theme } from '@/theme/tokens';

export function ConversationHeader({
  title,
  avatar,
  infoLabel,
  onInfo,
  callAvailable,
  showCalls,
  onVoice,
  onVideo,
}: {
  title: string;
  avatar?: ReactNode;
  infoLabel: string;
  onInfo?: (() => void) | undefined;
  callAvailable: boolean;
  showCalls: boolean;
  onVoice: () => void;
  onVideo: () => void;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const Identity = onInfo ? FocusPressable : View;
  return (
    <View style={styles.header}>
      <View style={styles.top}>
        <IconButton
          icon="chevron-left"
          label={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'))}
        />
        <Identity
          style={styles.identity}
          onPress={onInfo}
          accessibilityRole={onInfo ? 'button' : undefined}
          accessibilityLabel={onInfo ? `${title}. ${infoLabel}` : undefined}
        >
          {avatar}
          <View style={styles.heading}>
            <AppText variant="headline" numberOfLines={1} accessibilityRole="header">
              {title}
            </AppText>
            {onInfo && (
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                {infoLabel}
              </AppText>
            )}
          </View>
        </Identity>
      </View>
      {showCalls && (
        <View style={[styles.actions, fontScale > 1.35 && styles.stackedActions]}>
          <ConversationAction
            icon="phone"
            label={t('messenger.callVoice')}
            disabled={!callAvailable}
            onPress={onVoice}
          />
          <ConversationAction
            icon="video"
            label={t('messenger.callVideo')}
            disabled={!callAvailable}
            onPress={onVideo}
          />
        </View>
      )}
    </View>
  );
}

function ConversationAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'phone' | 'video';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.dimmed]}
    >
      <AppIcon name={icon} size={20} color={theme.colors.success} />
      <AppText variant="label" centered style={styles.actionLabel}>
        {label}
      </AppText>
    </FocusPressable>
  );
}

const styles = StyleSheet.create({
  header: {
    marginHorizontal: -theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.minTapTarget,
    borderRadius: theme.radii.md,
  },
  heading: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  stackedActions: { flexDirection: 'column' },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.controls.minTapTarget,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
  },
  actionLabel: { flexShrink: 1, color: theme.colors.success },
  dimmed: { opacity: theme.opacity.disabled },
});
