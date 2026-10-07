import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppIcon, type IconName } from './AppIcon';
import { FocusPressable } from './FocusPressable';
import { theme } from '@/theme/tokens';

export function FocusTabHeader({
  title,
  subtitle,
  actionLabel,
  actionIcon = 'plus',
  onAction,
  onTitlePress,
  titleActionLabel,
}: {
  title: string;
  subtitle?: string | undefined;
  actionLabel: string;
  actionIcon?: IconName;
  onAction: () => void;
  onTitlePress?: () => void;
  titleActionLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        {onTitlePress ? (
          <FocusPressable
            accessibilityRole="button"
            accessibilityLabel={titleActionLabel ?? title}
            onPress={onTitlePress}
            style={styles.title}
          >
            <AppText variant="focusTitle" accessibilityRole="header">
              {title}
            </AppText>
          </FocusPressable>
        ) : (
          <View style={styles.title}>
            <AppText variant="focusTitle" accessibilityRole="header">
              {title}
            </AppText>
          </View>
        )}
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppIcon name={actionIcon} size={24} color={theme.colors.onAccent} />
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
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: theme.controls.buttonHeight,
    height: theme.controls.buttonHeight,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  title: {
    flex: 1,
    minWidth: 0,
    minHeight: theme.controls.buttonHeight,
    justifyContent: 'center',
  },
  pressed: { backgroundColor: theme.colors.accentPressed },
});
