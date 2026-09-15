import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';

export function SettingsCard({
  title,
  icon,
  children,
}: PropsWithChildren<{ title: string; icon: IconName }>) {
  return (
    <View style={settingsStyles.card}>
      <View style={settingsStyles.heading}>
        <View style={settingsStyles.badge}>
          <AppIcon name={icon} color={theme.colors.success} />
        </View>
        <AppText variant="bodyMedium" accessibilityRole="header" style={settingsStyles.title}>
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

export function SettingsAction({
  label,
  icon,
  onPress,
  variant = 'accent',
  disabled = false,
  busy = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'accent' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const color = variant === 'danger' ? theme.colors.error : theme.colors.textPrimary;
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        settingsStyles.action,
        variant === 'accent' && settingsStyles.accent,
        variant === 'danger' && settingsStyles.danger,
        (disabled || busy) && settingsStyles.disabled,
        pressed && settingsStyles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <AppIcon name={icon} color={color} />
      ) : null}
      <AppText variant="button" centered style={[settingsStyles.actionLabel, { color }]}>
        {label}
      </AppText>
    </FocusPressable>
  );
}

export function SettingsChoice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        settingsStyles.choice,
        selected && settingsStyles.selected,
        pressed && settingsStyles.pressed,
      ]}
    >
      <AppText style={settingsStyles.title}>{label}</AppText>
      <AppIcon
        name={selected ? 'check-circle' : 'circle'}
        color={selected ? theme.colors.success : theme.colors.textSecondary}
        size={22}
      />
    </FocusPressable>
  );
}

export const settingsStyles = StyleSheet.create({
  page: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.step,
    gap: theme.spacing.md,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  title: { flex: 1, minWidth: 0 },
  badge: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSoft,
  },
  note: { fontSize: 14, lineHeight: 22 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    minHeight: 56,
    borderRadius: theme.radii.lg,
  },
  selected: { backgroundColor: theme.colors.accentSoft },
  action: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
  },
  actionLabel: { flexShrink: 1 },
  accent: { backgroundColor: theme.colors.accent },
  danger: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.error },
  field: { borderWidth: 0, borderRadius: theme.radii.lg, padding: theme.spacing.lg },
  disabled: { opacity: theme.opacity.disabled },
  pressed: { opacity: theme.opacity.pressed },
});
