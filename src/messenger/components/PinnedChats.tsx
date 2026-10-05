import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { CountBadge } from '@/components/CountBadge';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';
import type { Chat } from '../model';

export function PinnedChats({
  chats,
  avatar,
  subtitle,
  onPress,
  onManage,
}: {
  chats: readonly Chat[];
  avatar: (chat: Chat) => ReactNode;
  subtitle: (chat: Chat) => string;
  onPress: (chat: Chat) => void;
  onManage: (chat: Chat) => void;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  if (!chats.length) return null;
  return (
    <View style={styles.panel} testID="pinned-chats">
      <View style={styles.heading}>
        <AppIcon name="bookmark" size={theme.icons.sm} color={theme.colors.success} />
        <AppText variant="label" accessibilityRole="header" style={styles.headingText}>
          {t('focus.pinned')}
        </AppText>
      </View>
      <View style={styles.tiles}>
        {chats.map((chat) => (
          <FocusPressable
            key={chat.id}
            style={[styles.tile, fontScale > 1.3 && styles.largeTile]}
            accessibilityRole="button"
            accessibilityLabel={[
              chat.title,
              subtitle(chat),
              t('focus.pinned'),
              chat.unread ? t('messenger.unreadCount', { count: chat.unread }) : '',
            ]
              .filter(Boolean)
              .join('. ')}
            accessibilityActions={[{ name: 'unpin', label: t('focus.unpinChat') }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'unpin') onManage(chat);
            }}
            onPress={() => onPress(chat)}
            onLongPress={() => onManage(chat)}
          >
            <View style={styles.top}>
              {avatar(chat)}
              <CountBadge
                count={chat.unread}
                label={t('messenger.unreadCount', { count: chat.unread })}
              />
            </View>
            <AppText variant="bodyMedium" numberOfLines={fontScale > 1.3 ? undefined : 1}>
              {chat.title}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              {subtitle(chat)}
            </AppText>
          </FocusPressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderRadius: 24,
    backgroundColor: theme.colors.accentSoft,
    marginVertical: theme.spacing.md,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  headingText: { color: theme.colors.success },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  tile: {
    flex: 1,
    flexBasis: '45%',
    minWidth: 0,
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  largeTile: { flexBasis: '100%' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
});
