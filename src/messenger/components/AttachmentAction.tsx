import { StyleSheet, View } from 'react-native';
import { FocusPressable } from '@/components/FocusPressable';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';

export function AttachmentAction({
  icon,
  label,
  onPress,
  busy = false,
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  color: string;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={styles.action}
    >
      <View style={styles.icon}>
        <AppIcon name={icon} color={color} />
      </View>
      <AppText
        variant="caption"
        centered
        maxFontSizeMultiplier={1.2}
        numberOfLines={2}
        style={styles.label}
      >
        {label}
      </AppText>
    </FocusPressable>
  );
}
const styles = StyleSheet.create({
  action: {
    width: '25%',
    height: '50%',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { alignSelf: 'stretch', minHeight: 32, fontSize: 12, lineHeight: 16 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
