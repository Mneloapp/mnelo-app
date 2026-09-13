import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';

export function ReplyQuote({ chat, id }: { chat: string; id: string }) {
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
    (quote?.kind === 'image'
      ? t('messenger.photo')
      : quote?.kind === 'voice'
        ? t('messenger.voice')
        : quote?.kind === 'file'
          ? t('messenger.file')
          : t('messenger.quoteUnavailable'));
  return (
    <View style={styles.quote}>
      <AppText variant="label" numberOfLines={1}>
        {quote?.sender === identity?.key ? t('messenger.you') : quote?.name || t('messenger.reply')}
      </AppText>
      <AppText variant="caption" tone="secondary" numberOfLines={2}>
        {body}
      </AppText>
    </View>
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
