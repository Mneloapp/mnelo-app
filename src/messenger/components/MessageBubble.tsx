import type { PropsWithChildren, Ref } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import { formatTime } from '@/i18n/format';
import type { LocalMessage } from '../model';
import { DeliveryLeaf } from './MessageMetadata';

// Reactions are siblings of the bubble, never part of the message body or its copy action.
export function MessageBubble({
  own,
  containerStyle,
  bubbleRef,
  onLongPress,
  accessibilityLabel,
  status,
  sentAt,
  media,
  reactions = [],
  children,
}: PropsWithChildren<{
  own: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  bubbleRef?: Ref<View>;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  status: LocalMessage['status'];
  sentAt?: number;
  media?: boolean;
  reactions?: readonly { emoji: string }[];
}>) {
  const { t } = useTranslation();
  const counts = new Map<string, number>();
  for (const { emoji } of reactions) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  const receipt = own && (status === 'delivered' || status === 'read');
  return (
    <View style={[styles.row, own && styles.own, media && styles.media, containerStyle]}>
      <Pressable
        testID="message-bubble"
        ref={bubbleRef}
        collapsable={false}
        style={[styles.bubble, own && styles.outgoing]}
        onLongPress={onLongPress}
        delayLongPress={450}
        accessible={Boolean(onLongPress)}
        accessibilityRole={onLongPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={
          onLongPress ? [{ name: 'longpress', label: t('common.more') }] : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') onLongPress?.();
        }}
      >
        <View style={[styles.body, media && styles.mediaBody]}>{children}</View>
        {(sentAt !== undefined || receipt) && (
          <View style={styles.metadata} testID="message-metadata">
            {sentAt !== undefined && (
              <AppText variant="caption" tone="secondary" style={styles.time}>
                {formatTime(new Date(sentAt).toISOString())}
              </AppText>
            )}
            {receipt && <DeliveryLeaf status={status} />}
          </View>
        )}
      </Pressable>
      {counts.size > 0 && (
        <View testID="message-reactions" style={[styles.reactions, own && styles.ownReactions]}>
          {[...counts].map(([emoji, count]) => (
            <View
              key={emoji}
              style={styles.badge}
              accessible
              accessibilityLabel={t('messenger.reactionCount', { emoji, count })}
            >
              <AppText variant="caption">
                {emoji}
                {count > 1 ? ` ${count}` : ''}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    marginVertical: theme.spacing.xs,
    marginRight: theme.spacing.xl,
  },
  own: { alignSelf: 'flex-end', marginRight: 0, marginLeft: theme.spacing.xl },
  media: { width: '86%' },
  bubble: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: theme.spacing.sm,
    rowGap: theme.spacing.xs,
  },
  outgoing: { backgroundColor: theme.colors.messageOutgoing },
  body: { maxWidth: '100%' },
  mediaBody: { width: '100%' },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginLeft: 'auto',
  },
  time: { fontSize: 12, lineHeight: 16 },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: -theme.spacing.xs,
    marginHorizontal: theme.spacing.sm,
  },
  ownReactions: { justifyContent: 'flex-end' },
  badge: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.controls.borderWidth,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
});
