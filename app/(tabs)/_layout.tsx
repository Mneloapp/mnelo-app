import { useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { useAttentionCounts } from '@/messenger/attention';
import { CountBadge } from '@/components/CountBadge';
function TabIcon({
  name,
  focused,
  count = 0,
  label = '',
}: {
  name: IconName;
  focused: boolean;
  count?: number;
  label?: string;
}) {
  return (
    <View style={styles.icon}>
      <AppIcon name={name} color={focused ? theme.colors.black : theme.colors.textSecondary} />
      {count > 0 && (
        <View
          style={styles.badge}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <CountBadge count={count} label={label} appearance="navigation" />
        </View>
      )}
    </View>
  );
}
export default function TabLayout() {
  const { fontScale, width } = useWindowDimensions();
  const labelScale = Math.min(fontScale, theme.controls.navigationMaxScale);
  const insets = useSafeAreaInsets();
  // Keep the home indicator clear while placing iPhone tabs near the bottom edge.
  // Android retains its system inset for both gesture and three-button navigation.
  const bottomPadding =
    Platform.OS === 'ios'
      ? Math.min(insets.bottom, theme.controls.navigationHomeClearance)
      : insets.bottom;
  const { data: counts } = useAttentionCounts();
  const { t, i18n } = useTranslation();
  const measurementKey = `${width}:${insets.left}:${insets.right}:${fontScale}:${i18n.resolvedLanguage}`;
  const [labelMeasurements, setLabelMeasurements] = useState<{
    key: string;
    heights: Record<string, number>;
  }>({ key: measurementKey, heights: {} });
  // Share the actual tallest label across tabs. Larger text alone must not reserve
  // an empty second line; wrapping can still grow the bar on narrow screens.
  const labelHeight = Math.max(
    theme.typography.tabLabel.lineHeight * labelScale,
    ...Object.values(labelMeasurements.key === measurementKey ? labelMeasurements.heights : {}),
  );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        lazy: false,
        sceneStyle: { backgroundColor: theme.colors.background },
        tabBarActiveTintColor: theme.colors.black,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarAllowFontScaling: true,
        tabBarLabelPosition: 'below-icon',
        tabBarActiveBackgroundColor: theme.colors.accent,
        tabBarIconStyle: { height: theme.icons.md },
        tabBarStyle: {
          height:
            Math.max(theme.controls.minTapTarget, theme.icons.md + labelHeight + theme.spacing.md) +
            theme.spacing.xs +
            bottomPadding +
            theme.controls.borderWidth,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingTop: theme.spacing.xs,
          paddingBottom: bottomPadding,
          paddingHorizontal: Math.max(insets.left, insets.right) + theme.spacing.lg,
        },
        tabBarLabel: ({ color, children }) => (
          <AppText
            variant="tabLabel"
            centered
            numberOfLines={2}
            maxFontSizeMultiplier={theme.controls.navigationMaxScale}
            onTextLayout={({ nativeEvent: { lines } }) => {
              const height = Math.ceil(
                lines.slice(0, 2).reduce((total, line) => total + line.height, 0),
              );
              setLabelMeasurements((current) => {
                const heights = current.key === measurementKey ? current.heights : {};
                if (heights[children] === height) return current;
                return { key: measurementKey, heights: { ...heights, [children]: height } };
              });
            }}
            style={{ color }}
          >
            {children}
          </AppText>
        ),
        tabBarLabelStyle: theme.typography.tabLabel,
        tabBarItemStyle: {
          minHeight: theme.controls.minTapTarget,
          maxWidth: theme.controls.navigationPillWidth + (labelScale - 1) * theme.spacing.xxl,
          marginHorizontal: 'auto',
          borderRadius: theme.radii.md,
          overflow: 'hidden',
        },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: t('tabs.chats'),
          tabBarAccessibilityLabel: counts?.messages
            ? t('tabs.chats') + '. ' + t('messenger.unreadCount', { count: counts.messages })
            : t('tabs.chats'),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="message-circle"
              focused={focused}
              count={counts?.messages ?? 0}
              label={t('messenger.unreadCount', { count: counts?.messages ?? 0 })}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: t('tabs.calls'),
          tabBarAccessibilityLabel: counts?.calls
            ? t('tabs.calls') + '. ' + t('messenger.missedCount', { count: counts.calls })
            : t('tabs.calls'),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="phone"
              focused={focused}
              count={counts?.calls ?? 0}
              label={t('messenger.missedCount', { count: counts?.calls ?? 0 })}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t('tabs.me'),
          tabBarAccessibilityLabel: t('tabs.me'),
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -theme.spacing.sm, top: -theme.spacing.xs },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.spacing.xxl,
    height: theme.icons.md,
  },
});
