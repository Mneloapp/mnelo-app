import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { FocusPressable } from '@/components/FocusPressable';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';

export function AttachmentAction({
  icon,
  label,
  onPress,
  busy = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={[styles.action, { width: fontScale > 1.3 ? '50%' : '33.333333%' }]}
    >
      <View style={styles.icon}>
        <AppIcon name={icon} />
      </View>
      <AppText variant="label" centered>
        {label}
      </AppText>
    </FocusPressable>
  );
}
const styles = StyleSheet.create({
  action: { padding: theme.spacing.sm, gap: theme.spacing.sm, alignItems: 'center' },
  icon: {
    width: theme.controls.buttonHeight,
    height: theme.controls.buttonHeight,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
