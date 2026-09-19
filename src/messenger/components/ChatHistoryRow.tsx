import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { CountBadge } from '@/components/CountBadge';
import { formatTime, formatDate } from '@/i18n/format';
import { theme } from '@/theme/tokens';
import type { Chat } from '../model';
export function chatStamp(time: number, now: number) {
  if (!time) return '';
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toDateString() === new Date(now).toDateString()
    ? formatTime(date.toISOString())
    : formatDate(date.toISOString());
}
export function ChatHistoryRow({
  chat,
  subtitle,
  avatar,
  onPress,
  now,
  onDelete,
  onExportDelete,
}: {
  chat: Chat;
  subtitle: string;
  avatar: ReactNode;
  onPress: () => void;
  now?: number;
  onDelete?: () => void;
  onExportDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [mountedAt] = useState(Date.now);
  const { fontScale } = useWindowDimensions();
  const stamp = chatStamp(chat.updated, Math.max(now ?? mountedAt, chat.updated)),
    unread = t('messenger.unreadCount', { count: chat.unread });
  return (
    <FocusPressable
      onPress={onPress}
      accessibilityActions={
        onDelete
          ? [
              { name: 'delete', label: t('messenger.deleteChat') },
              { name: 'exportDelete', label: t('messenger.exportDeleteChat') },
            ]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onDelete?.();
        if (event.nativeEvent.actionName === 'exportDelete') onExportDelete?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={[chat.title, subtitle, stamp, chat.unread ? unread : '']
        .filter(Boolean)
        .join('. ')}
      style={styles.row}
    >
      {avatar}
      <View style={styles.content}>
        <View style={styles.top}>
          <AppText
            variant="bodyMedium"
            style={uiTitle}
            numberOfLines={fontScale > 1.3 ? undefined : 1}
          >
            {chat.title}
          </AppText>
          {Boolean(stamp) && (
            <AppText variant="caption" tone="secondary" style={styles.stamp}>
              {stamp}
            </AppText>
          )}
        </View>
        <View style={styles.top}>
          <AppText variant="caption" tone="secondary" style={uiTitle} numberOfLines={2}>
            {subtitle}
          </AppText>
          <CountBadge count={chat.unread} label={unread} />
        </View>
      </View>
    </FocusPressable>
  );
}
const uiTitle = { flex: 1, minWidth: 0 };
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  content: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.controls.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  stamp: { maxWidth: '35%', flexShrink: 0, textAlign: 'right' },
});
