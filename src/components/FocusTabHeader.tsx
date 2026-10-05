import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { AppIcon, type IconName } from './AppIcon';
import { FocusPressable } from './FocusPressable';
import { MneloLogo } from './MneloBrand';
import { IconButton } from './ui';
import { theme } from '@/theme/tokens';
import { useTranslation } from 'react-i18next';

export function FocusTabHeader({
  title,
  subtitle,
  actionLabel,
  actionIcon = 'plus',
  onAction,
  onSearch,
  onTitlePress,
  titleActionLabel,
}: {
  title: string;
  subtitle?: string | undefined;
  actionLabel: string;
  actionIcon?: IconName;
  onAction: () => void;
  onSearch?: () => void;
  onTitlePress?: () => void;
  titleActionLabel?: string;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.header}>
      <View style={[styles.brandRow, fontScale >= 1.7 && styles.brandStack]}>
        <MneloLogo />
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppIcon name={actionIcon} size={20} color={theme.colors.onBlack} />
          <AppText variant="label" style={styles.actionText}>
            {actionLabel}
          </AppText>
        </FocusPressable>
      </View>
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
          <AppText variant="focusTitle" accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
        )}
        {onSearch && <IconButton icon="search" label={t('common.search')} onPress={onSearch} />}
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
  header: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.lg, gap: theme.spacing.xs },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.step,
  },
  brandStack: { flexDirection: 'column', alignItems: 'flex-start' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.black,
    borderRadius: theme.radii.md,
    minHeight: theme.controls.minTapTarget,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actionText: { color: theme.colors.onBlack, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  title: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: theme.colors.blackPressed },
});
