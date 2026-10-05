import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { AppIcon, type IconName } from './AppIcon';
import { FocusPressable } from './FocusPressable';
import { CountBadge } from './CountBadge';
import { theme } from '@/theme/tokens';

export type FocusTabItem = {
  key: string;
  label: string;
  accessibilityLabel: string;
  icon: IconName;
  selected: boolean;
  count: number;
  countLabel: string;
  onPress: () => void;
  onLongPress: () => void;
};

export function FocusTabBar({
  items,
  insets,
}: {
  items: FocusTabItem[];
  insets: { bottom: number; left: number; right: number };
}) {
  const { fontScale } = useWindowDimensions();
  const bottomPadding =
    Platform.OS === 'ios'
      ? Math.min(insets.bottom, theme.controls.navigationHomeClearance)
      : insets.bottom;
  return (
    <View
      style={[
        styles.safe,
        {
          paddingBottom: Math.max(bottomPadding, theme.spacing.md),
          paddingLeft: insets.left + theme.spacing.step,
          paddingRight: insets.right + theme.spacing.step,
        },
      ]}
    >
      <View style={styles.bar} accessibilityRole="tablist">
        {items.map((item) => (
          <FocusPressable
            key={item.key}
            accessibilityRole="tab"
            focusColor={theme.colors.onBlack}
            accessibilityLabel={item.accessibilityLabel}
            accessibilityState={{ selected: item.selected }}
            aria-selected={item.selected}
            onPress={item.onPress}
            onLongPress={item.onLongPress}
            style={({ pressed }) => [
              styles.item,
              item.selected && styles.selected,
              fontScale >= 1.7 && item.selected && styles.largeText,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.icon}>
              <AppIcon
                name={item.icon}
                color={item.selected ? theme.colors.onAccent : theme.colors.navigationText}
              />
              {item.count > 0 && (
                <View
                  style={styles.badge}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  aria-hidden
                >
                  <CountBadge
                    count={item.count}
                    label={item.countLabel}
                    appearance={item.selected ? 'navigation' : 'default'}
                  />
                </View>
              )}
            </View>
            {item.selected && (
              <AppText
                variant="bodyMedium"
                centered
                maxFontSizeMultiplier={theme.controls.navigationMaxScale}
                style={styles.label}
              >
                {item.label}
              </AppText>
            )}
          </FocusPressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: theme.colors.background, paddingTop: theme.spacing.sm },
  bar: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth - theme.spacing.section,
    alignSelf: 'center',
    backgroundColor: theme.colors.navigation,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.navigation,
  },
  item: {
    flexBasis: theme.controls.minTapTarget,
    flexGrow: 1,
    minWidth: theme.controls.minTapTarget,
    minHeight: theme.controls.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  selected: { flexGrow: 2.4, backgroundColor: theme.colors.accent },
  largeText: { flexDirection: 'column' },
  label: { color: theme.colors.onAccent, flexShrink: 1 },
  icon: {
    width: theme.icons.md,
    height: theme.icons.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { position: 'absolute', right: -theme.spacing.sm, top: -theme.spacing.sm },
  pressed: { opacity: theme.opacity.pressed },
});
