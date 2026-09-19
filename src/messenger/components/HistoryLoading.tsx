import { StyleSheet, View, type DimensionValue } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';

const widths: DimensionValue[] = ['64%', '48%', '56%'];

// A small static preview of the list structure, never simulated contacts or
// messages. Only the parent query decides when it appears and disappears.
export function HistoryLoading() {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
      pointerEvents="none"
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {widths.map((width, index) => (
          <View key={index} style={styles.row}>
            <View style={styles.avatar} />
            <View style={styles.content}>
              <View style={styles.heading}>
                <View style={[styles.bar, styles.title, { width }]} />
                <View style={[styles.bar, styles.stamp]} />
              </View>
              <View style={[styles.bar, styles.subtitle]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: {
    width: theme.avatar.normal,
    height: theme.avatar.normal,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
    borderBottomWidth: theme.controls.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { backgroundColor: theme.colors.border, borderRadius: theme.radii.pill },
  title: { height: theme.spacing.md },
  subtitle: { height: theme.spacing.sm, width: '76%' },
  stamp: { height: theme.spacing.sm, width: theme.spacing.section },
});
