import { Image, View, Linking, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, StateView, ui } from '@/components/ui';
import { repository } from '@/services';
import { useAction } from '@/hooks/useAction';
import type { Message } from '@/types/domain';
import { theme } from '@/theme/tokens';
import { AudioPlayback } from './AudioPlayback';
import { discardCachedMedia } from './media-files';
export function AttachmentContent({ message }: { message: Message }) {
  const { t } = useTranslation();
  const a = useAction();
  const q = useQuery({
    queryKey: ['attachment', message.attachmentId],
    queryFn: () => repository().attachment(message.attachmentId!),
    enabled: Boolean(message.attachmentId) && !message.deletedAt,
    staleTime: 30000,
    gcTime: 60000,
  });
  if (q.isPending) return <StateView loading />;
  if (q.isError || !q.data)
    return <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />;
  const media = q.data;
  async function open() {
    const fresh = await repository().attachment(media.id);
    if (Platform.OS === 'web') {
      await Linking.openURL(fresh.url);
      return;
    }
    const local = new File(
      Paths.cache,
      media.id + '-' + media.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
    );
    try {
      const file = await File.downloadFileAsync(fresh.url, local, { idempotent: true });
      await Sharing.shareAsync(file.uri, { mimeType: media.mime, dialogTitle: media.name });
    } finally {
      discardCachedMedia(local.uri);
    }
  }
  return (
    <View style={ui.stack}>
      {message.kind === 'image' ? (
        <Image
          accessible
          source={{ uri: media.url, cache: 'reload' }}
          accessibilityLabel={t('chat.photo')}
          style={{
            width: theme.controls.textareaHeight * 2,
            height: theme.controls.textareaHeight * 2,
            maxWidth: '100%',
            borderRadius: theme.radii.md,
          }}
          resizeMode="contain"
        />
      ) : message.kind === 'voice' ? (
        <AudioPlayback
          uri={media.url}
          durationSeconds={media.duration ?? 0}
          resolveUri={async () => (await repository().attachment(media.id)).url}
        />
      ) : (
        <AppText>{media.name}</AppText>
      )}
      {Boolean(message.text) && <AppText>{message.text}</AppText>}
      {message.kind !== 'voice' && (
        <Button
          variant="secondary"
          label={t('media.openFile')}
          busy={a.busy}
          onPress={() => void a.run(open)}
        />
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </View>
  );
}
