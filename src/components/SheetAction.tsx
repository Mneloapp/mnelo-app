import { StyleSheet, View } from 'react-native';
import { AppIcon, type IconName } from './AppIcon';
import { AppText } from './AppText';
import { FocusPressable } from './FocusPressable';
import { theme } from '@/theme/tokens';

export function SheetAction({
  icon,
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.icon}>
        <AppIcon name={icon} color={danger ? theme.colors.error : theme.colors.textPrimary} />
      </View>
      <AppText style={[styles.label, danger && styles.danger]}>{label}</AppText>
    </FocusPressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.minTapTarget,
    paddingVertical: theme.spacing.sm,
  },
  icon: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radii.md,
  },
  label: { flex: 1 },
  danger: { color: theme.colors.error },
});
