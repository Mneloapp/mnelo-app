import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { FocusPressable } from '@/components/FocusPressable';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';

export function CallAction({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  danger = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        pressed && { opacity: theme.opacity.pressed },
        (disabled || busy) && { opacity: theme.opacity.disabled },
      ]}
    >
      <View style={[styles.circle, danger && styles.danger]}>
        {busy ? (
          <ActivityIndicator color={theme.colors.callText} />
        ) : (
          <AppIcon name={icon} color={theme.colors.callText} />
        )}
      </View>
      <AppText variant="caption" centered>
        {label}
      </AppText>
    </FocusPressable>
  );
}
const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    flexShrink: 1,
    minWidth: theme.controls.minTapTarget,
  },
  circle: {
    width: theme.controls.callDiameter,
    height: theme.controls.callDiameter,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.callSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: { backgroundColor: theme.colors.endCall },
});
