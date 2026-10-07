import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { AppIcon, type IconName } from './AppIcon';
import { FocusPressable } from './FocusPressable';
import { theme } from '@/theme/tokens';

export function FocusTabHeader({
  title,
  subtitle,
  actionLabel,
  actionIcon = 'plus',
  actionIconOnly = false,
  onAction,
  onTitlePress,
  titleActionLabel,
}: {
  title: string;
  subtitle?: string | undefined;
  actionLabel: string;
  actionIcon?: IconName;
  actionIconOnly?: boolean;
  onAction: () => void;
  onTitlePress?: () => void;
  titleActionLabel?: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = (!actionIconOnly && width < 375) || fontScale >= 1.35;
  return (
    <View style={styles.header}>
      <View style={[styles.titleRow, stacked && styles.titleStack]}>
        {onTitlePress ? (
          <FocusPressable
            accessibilityRole="button"
            accessibilityLabel={titleActionLabel ?? title}
            onPress={onTitlePress}
            style={[styles.title, styles.titleControl, stacked && styles.stackedTitle]}
          >
            <AppText variant="focusTitle" accessibilityRole="header">
              {title}
            </AppText>
          </FocusPressable>
        ) : (
          <AppText
            variant="focusTitle"
            accessibilityRole="header"
            style={[styles.title, stacked && styles.stackedTitle]}
          >
            {title}
          </AppText>
        )}
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            actionIconOnly && styles.iconAction,
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name={actionIcon} size={20} color={theme.colors.onAccent} />
          {!actionIconOnly && (
            <AppText variant="label" style={styles.actionText}>
              {actionLabel}
            </AppText>
          )}
        </FocusPressable>
      </View>
      {Boolean(subtitle) && (
        <AppText tone="secondary" variant="caption">
          {subtitle}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.lg, gap: theme.spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    maxWidth: '100%',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.md,
    minHeight: theme.controls.minTapTarget,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actionText: { color: theme.colors.onAccent, flexShrink: 1 },
  iconAction: { width: theme.controls.minTapTarget, paddingHorizontal: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  titleStack: { flexDirection: 'column', alignItems: 'flex-start' },
  title: { flex: 1, minWidth: 0 },
  titleControl: { minHeight: theme.controls.minTapTarget, justifyContent: 'center' },
  stackedTitle: { flex: 0, width: '100%' },
  pressed: { backgroundColor: theme.colors.accentPressed },
});
