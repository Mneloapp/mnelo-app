import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
import { useAttentionCounts } from '@/messenger/attention';
import { FocusTabBar } from '@/components/FocusTabBar';
import type { IconName } from '@/components/AppIcon';

const icons: Record<string, IconName> = { chats: 'message-circle', calls: 'phone', me: 'user' };

export default function TabLayout() {
  const { data: counts } = useAttentionCounts();
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        lazy: false,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
      tabBar={({ state, descriptors, navigation, insets }) => (
        <FocusTabBar
          insets={insets}
          items={state.routes.map((route, index) => {
            const selected = state.index === index;
            const label = descriptors[route.key]?.options.title ?? route.name;
            const count =
              route.name === 'chats'
                ? (counts?.messages ?? 0)
                : route.name === 'calls'
                  ? (counts?.calls ?? 0)
                  : 0;
            const countLabel =
              route.name === 'calls'
                ? t('messenger.missedCount', { count })
                : t('messenger.unreadCount', { count });
            return {
              key: route.key,
              label,
              icon: icons[route.name] ?? 'circle',
              selected,
              count,
              countLabel,
              accessibilityLabel: count > 0 ? `${label}. ${countLabel}` : label,
              onPress: () => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!selected && !event.defaultPrevented)
                  navigation.navigate(route.name, route.params);
              },
              onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
            };
          })}
        />
      )}
    >
      <Tabs.Screen name="chats" options={{ title: t('tabs.chats') }} />
      <Tabs.Screen name="calls" options={{ title: t('tabs.calls') }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.me') }} />
    </Tabs>
  );
}
