import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import type { LocalMessage } from '../model';
import { DeliveryLeaf } from './MessageMetadata';

// Reactions are siblings of the bubble, never part of the message body or its copy action.
export function MessageBubble({
  own,
  status,
  media,
  reactions = [],
  children,
}: PropsWithChildren<{
  own: boolean;
  status: LocalMessage['status'];
  media?: boolean;
  reactions?: readonly { emoji: string }[];
}>) {
  const { t } = useTranslation();
  const counts = new Map<string, number>();
  for (const { emoji } of reactions) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  const receipt = own && (status === 'delivered' || status === 'read');
  return (
    <View style={[styles.row, own && styles.own, media && styles.media]}>
      <View
        testID="message-bubble"
        style={[styles.bubble, own && styles.outgoing, receipt && styles.withReceipt]}
      >
        {children}
        {receipt && (
          <View style={styles.receipt}>
            <DeliveryLeaf status={status} />
          </View>
        )}
      </View>
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
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
  },
  outgoing: { backgroundColor: theme.colors.messageOutgoing },
  withReceipt: { paddingRight: theme.spacing.xxl },
  receipt: { position: 'absolute', right: theme.spacing.sm, bottom: theme.spacing.sm },
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
