import { ActivityIndicator, StyleSheet } from 'react-native';
import { FocusPressable as Pressable } from '@/components/FocusPressable';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { theme } from '@/theme/tokens';

// Composer controls share a fixed slot so replacing the microphone with Send
// never changes the input width or its baseline.
export function ComposerAction({
  icon,
  label,
  onPress,
  accent = false,
  disabled = false,
  busy = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        accent && styles.accent,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.onAccent} />
      ) : (
        <AppIcon
          name={icon}
          size={theme.icons.md}
          color={accent ? theme.colors.onAccent : theme.colors.textPrimary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: theme.controls.inputHeight,
    height: theme.controls.inputHeight,
    flexShrink: 0,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accent: { backgroundColor: theme.colors.accent },
  disabled: { opacity: theme.opacity.disabled },
  pressed: { opacity: theme.opacity.pressed },
});
