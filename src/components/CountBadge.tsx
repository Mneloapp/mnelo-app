import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { theme } from '@/theme/tokens';
export function badgeLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}
export function CountBadge({
  count,
  label,
  appearance = 'default',
}: {
  count: number;
  label: string;
  appearance?: 'default' | 'navigation';
}) {
  if (count <= 0) return null;
  return (
    <View
      style={[styles.badge, appearance === 'navigation' && styles.navigation]}
      accessibilityLabel={label}
      accessible
    >
      <AppText
        variant="micro"
        centered
        maxFontSizeMultiplier={1.3}
        style={[styles.text, appearance === 'navigation' && styles.navigationText]}
      >
        {badgeLabel(count)}
      </AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  badge: {
    minWidth: theme.typography.micro.lineHeight + theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: theme.colors.onAccent },
  navigation: { backgroundColor: theme.colors.black },
  navigationText: { color: theme.colors.onBlack },
});
