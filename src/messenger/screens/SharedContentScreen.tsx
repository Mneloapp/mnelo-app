import { useState } from 'react';
import { FlatList, Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { Button, Page, StateView, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { discardCachedMedia } from '@/features/chats/media-files';
import { useDevice } from '../DeviceProvider';
import { ChatPhoto } from '../components/ChatPhoto';
import type { ContentTab, SharedItem } from '../shared-content';
import { useLocalAction } from './shared';

function SharedFile({ item, grid, chatId }: { item: SharedItem; grid: boolean; chatId: string }) {
  const { engine } = useDevice();
  const { t, i18n } = useTranslation();
  const action = useLocalAction();
  const isImage = Boolean(item.mime?.startsWith('image/'));
  const photo = useQuery({
    queryKey: ['device', 'shared-image', item.attachment],
    queryFn: () => engine.media(item.attachment!),
    enabled: isImage && Boolean(item.attachment),
    networkMode: 'always',
    gcTime: 0,
  });
  function open() {
    void action.run(async () => {
      if (!item.attachment) throw new Error('MEDIA_MISSING');
      const media = photo.data ?? (await engine.media(item.attachment));
      if (!media) throw new Error('MEDIA_MISSING');
      // Keep only a safe basename, with a unique temporary prefix; never use a peer's path.
      const name = media.name.replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(-100) || 'file';
      const file = new File(Paths.cache, `mnelo-shared-${Date.now()}-${name}`);
      try {
        file.write(Uint8Array.from(atob(media.bytes), (value) => value.charCodeAt(0)));
        await Sharing.shareAsync(file.uri, { mimeType: media.mime });
      } finally {
        discardCachedMedia(file.uri);
      }
    });
  }
  const date = new Date(item.sentAt).toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <View style={grid ? styles.gridItem : styles.document}>
      {isImage && photo.data ? (
        <ChatPhoto
          source={{
            id: item.id,
            chatId,
            sequence: item.sequence,
            sentAt: item.sentAt,
            attachment: item.attachment!,
          }}
          name={item.name ?? t('library.media')}
          uri={`data:${photo.data.mime};base64,${photo.data.bytes}`}
          square
          share={open}
          onLongPress={() => {}}
          busy={action.busy}
          error={action.error ?? null}
        />
      ) : (
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={`${t('messenger.openFile')}: ${item.name ?? ''}`}
          disabled={action.busy}
          accessibilityState={{ disabled: action.busy }}
          onPress={open}
          style={grid ? styles.fileTile : styles.fileRow}
        >
          <AppIcon
            name={item.mime?.startsWith('video/') ? 'video' : 'file-text'}
            color={theme.colors.success}
          />
          <View style={ui.flex}>
            <AppText variant="caption" numberOfLines={2}>
              {item.name}
            </AppText>
            {!grid && (
              <AppText variant="caption" tone="secondary">
                {date}
              </AppText>
            )}
          </View>
        </FocusPressable>
      )}
      {action.error && (
        <AppText variant="caption" accessibilityRole="alert">
          {action.error}
        </AppText>
      )}
    </View>
  );
}

export function SharedContentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, view } = useDevice();
  const { t, i18n } = useTranslation();
  const action = useLocalAction();
  const [tab, setTab] = useState<ContentTab>('media');
  const { width, fontScale } = useWindowDimensions();
  const columns = width < 360 || fontScale >= 1.4 ? 3 : 4;
  const valid = typeof id === 'string' && id.length > 0 && id.length <= 80;
  const chat = useQuery({
    queryKey: ['device', 'chat', id],
    queryFn: () => view.chat(id),
    enabled: valid,
    networkMode: 'always',
  });
  const content = useInfiniteQuery({
    queryKey: ['device', 'shared-content', id, tab],
    queryFn: ({ pageParam }) => engine.sharedContent(id, tab, pageParam),
    initialPageParam: Number.MAX_SAFE_INTEGER,
    getNextPageParam: (page) => page.next,
    enabled: valid && Boolean(chat.data),
    networkMode: 'always',
  });
  const items = content.data?.pages.flatMap((page) => page.items) ?? [];
  const error = content.isError || chat.isError;
  return (
    <Page title={t('library.title')} back scroll={false} contentStyle={styles.content}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['media', 'links', 'docs'] as const).map((value) => (
          <FocusPressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={t(`library.${value}`)}
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.selected]}
          >
            <AppText variant="label" centered>
              {t(`library.${value}`)}
            </AppText>
          </FocusPressable>
        ))}
      </View>
      {chat.data && (
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.caption}>
          {chat.data.title}
        </AppText>
      )}
      <FlatList
        key={`${id}-${tab}-${columns}`}
        data={items}
        style={ui.flex}
        numColumns={tab === 'media' ? columns : 1}
        keyExtractor={(item) => item.id + (item.url ?? '')}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={3}
        renderItem={({ item }) =>
          tab === 'links' ? (
            <FocusPressable
              accessibilityRole="link"
              accessibilityLabel={item.url}
              style={styles.link}
              onPress={() => void action.run(() => Linking.openURL(item.url!))}
            >
              <View style={styles.linkIcon}>
                <AppIcon name="link" color={theme.colors.success} />
              </View>
              <View style={ui.flex}>
                <AppText variant="label" numberOfLines={1}>
                  {new URL(item.url!).hostname}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={2}>
                  {item.url}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {new Date(item.sentAt).toLocaleDateString(i18n.language)}
                </AppText>
              </View>
              <AppIcon name="arrow-up-right" size={18} />
            </FocusPressable>
          ) : (
            <View style={tab === 'media' ? { width: `${100 / columns}%` } : undefined}>
              <SharedFile item={item} chatId={id} grid={tab === 'media'} />
            </View>
          )
        }
        ListEmptyComponent={
          <StateView
            loading={valid && (chat.isPending || (Boolean(chat.data) && content.isPending))}
            error={error ? t('messenger.genericError') : undefined}
            message={t(
              valid && chat.data
                ? `library.empty${tab === 'media' ? 'Media' : tab === 'links' ? 'Links' : 'Docs'}`
                : 'library.unavailable',
            )}
          />
        }
        onEndReached={() => {
          if (content.hasNextPage && !content.isFetching && !content.isError)
            void content.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          <View style={styles.footer}>
            {error && (
              <Button
                variant="secondary"
                label={t('common.retry')}
                onPress={() => {
                  void chat.refetch();
                  void content.refetch();
                }}
              />
            )}
            {content.hasNextPage && (
              <Button
                variant="secondary"
                label={t('common.loadMore')}
                busy={content.isFetchingNextPage}
                onPress={() => void content.fetchNextPage()}
              />
            )}
          </View>
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 0, paddingBottom: 0, gap: theme.spacing.sm },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.lg,
    padding: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radii.pill,
  },
  selected: { backgroundColor: theme.colors.accentSoft },
  caption: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  gridItem: { padding: 1, aspectRatio: 1, overflow: 'hidden' },
  document: {
    marginHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  fileTile: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
    justifyContent: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    minHeight: 80,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  link: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  linkIcon: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { padding: theme.spacing.lg, gap: theme.spacing.md },
});
