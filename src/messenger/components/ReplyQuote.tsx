import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';

export function ReplyQuote({
  chat,
  id,
  onPress,
}: {
  chat: string;
  id: string;
  onPress?: (() => void) | undefined;
}) {
  const { identity, view } = useDevice();
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['device', 'reply', chat, id],
    queryFn: () => view.replyPreview(chat, id),
    networkMode: 'always',
  });
  const quote = q.data;
  const body =
    quote?.body ||
    (quote?.kind === 'deleted'
      ? t('messenger.deletedMessage')
      : quote?.kind === 'image'
        ? t('messenger.photo')
        : quote?.kind === 'voice'
          ? t('messenger.voice')
          : quote?.kind === 'contact'
            ? t('messenger.contact')
            : quote?.kind === 'file'
              ? t('messenger.file')
              : t('messenger.quoteUnavailable'));
  const content = (
    <View style={styles.quote}>
      <AppText variant="label" numberOfLines={1}>
        {quote?.sender === identity?.key ? t('messenger.you') : quote?.name || t('messenger.reply')}
      </AppText>
      <AppText variant="caption" tone="secondary" numberOfLines={2}>
        {body}
      </AppText>
    </View>
  );
  return onPress ? (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={t('messenger.viewOriginal')}
      onPress={onPress}
    >
      {content}
    </FocusPressable>
  ) : (
    content
  );
}
const styles = StyleSheet.create({
  quote: {
    borderLeftWidth: theme.spacing.xs,
    borderLeftColor: theme.colors.success,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
});
