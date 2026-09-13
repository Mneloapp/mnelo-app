import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { IconButton, ui } from '@/components/ui';
import { FocusPressable } from '@/components/FocusPressable';
import { ScreenAppearance } from '@/theme/appearance';
import { theme } from '@/theme/tokens';
import { formatDate, formatTime } from '@/i18n/format';
import { discardCachedMedia } from '@/features/chats/media-files';
import { useDevice } from '../DeviceProvider';
import { useLocalAction } from '../screens/shared';
import type { PhotoSource, SharedItem } from '../shared-content';

function usePhoto(item: SharedItem, enabled = true) {
  const { engine } = useDevice();
  return useQuery({
    queryKey: ['device', 'gallery-image', item.attachment],
    queryFn: () => engine.media(item.attachment!),
    enabled: enabled && Boolean(item.attachment),
    networkMode: 'always',
    gcTime: 0,
    staleTime: Infinity,
  });
}

function PhotoSlide({
  item,
  width,
  height,
  selected,
  nearby,
  onZoom,
}: {
  item: SharedItem;
  width: number;
  height: number;
  selected: boolean;
  nearby: boolean;
  onZoom: (zoomed: boolean) => void;
}) {
  const photo = usePhoto(item, nearby);
  const { t } = useTranslation();
  return (
    <View style={{ width, height }} testID={'gallery-page-' + item.id}>
      {photo.data?.mime.startsWith('image/') ? (
        <ScrollView
          key={selected ? 'selected' : 'adjacent'}
          style={ui.flex}
          contentContainerStyle={styles.fullPhoto}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          bouncesZoom
          scrollEventThrottle={16}
          onScroll={(event) => {
            if (selected) onZoom((event.nativeEvent.zoomScale ?? 1) > 1.01);
          }}
        >
          <Image
            source={{ uri: `data:${photo.data.mime};base64,${photo.data.bytes}` }}
            resizeMode="contain"
            accessibilityLabel={item.name ?? t('library.media')}
            style={{ width, height }}
          />
        </ScrollView>
      ) : (
        <View style={styles.state}>
          {photo.isPending ? (
            <ActivityIndicator color={theme.colors.callText} />
          ) : (
            <>
              <AppText centered>{t('library.photoUnavailable')}</AppText>
              <IconButton
                icon="refresh-cw"
                label={t('common.retry')}
                onPress={() => void photo.refetch()}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function PhotoThumbnail({
  item,
  selected,
  disabled,
  onPress,
}: {
  item: SharedItem;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const photo = usePhoto(item);
  const { t } = useTranslation();
  return (
    <FocusPressable
      testID={'gallery-thumbnail-' + item.id}
      accessibilityRole="button"
      accessibilityLabel={t('library.selectPhoto', { name: item.name ?? t('library.media') })}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.thumbnail, selected && styles.selected]}
    >
      {photo.data?.mime.startsWith('image/') ? (
        <Image
          source={{ uri: `data:${photo.data.mime};base64,${photo.data.bytes}` }}
          resizeMode="cover"
          style={styles.thumbnailImage}
        />
      ) : (
        <AppIcon name="image" size={theme.icons.sm} />
      )}
    </FocusPressable>
  );
}

export function PhotoGallery({
  source,
  name,
  onClose,
}: {
  source: PhotoSource;
  name: string;
  onClose: () => void;
}) {
  const { engine } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [activeId, setActiveId] = useState(source.id);
  const [shareId, setShareId] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const pager = useRef<FlatList<SharedItem>>(null);
  const strip = useRef<FlatList<SharedItem>>(null);
  const older = useInfiniteQuery({
    queryKey: ['device', 'gallery', source.chatId, source.id, 'before'],
    queryFn: ({ pageParam }) => engine.photoPage(source.chatId, pageParam, 'before'),
    initialPageParam: source.sequence + 1,
    getNextPageParam: (page) => page.next,
    networkMode: 'always',
  });
  const newer = useInfiniteQuery({
    queryKey: ['device', 'gallery', source.chatId, source.id, 'after'],
    queryFn: ({ pageParam }) => engine.photoPage(source.chatId, pageParam, 'after'),
    initialPageParam: source.sequence,
    getNextPageParam: (page) => page.next,
    networkMode: 'always',
  });
  const items = useMemo(() => {
    const seed: SharedItem = { ...source, name, body: '', mime: null, duration: null };
    const unique = new Map<string, SharedItem>([[source.id, seed]]);
    for (const page of [...(older.data?.pages ?? []), ...(newer.data?.pages ?? [])])
      for (const item of page.items) unique.set(item.id, item);
    return [...unique.values()].sort((a, b) => a.sequence - b.sequence);
  }, [older.data, newer.data, source, name]);
  const index = Math.max(
    0,
    items.findIndex((item) => item.id === activeId),
  );
  const current = items[index]!;
  useLayoutEffect(() => {
    if (viewport.width > 0)
      pager.current?.scrollToOffset({ offset: index * viewport.width, animated: false });
    strip.current?.scrollToIndex({ index, animated: false, viewPosition: 0.5 });
  }, [index, viewport.width]);
  useEffect(() => {
    if (index <= 2 && older.hasNextPage && !older.isFetching && !older.isError)
      void older.fetchNextPage();
    if (index >= items.length - 3 && newer.hasNextPage && !newer.isFetching && !newer.isError)
      void newer.fetchNextPage();
  }, [index, items.length, older, newer]);
  function select(next: number) {
    if (action.busy || !items[next]) return;
    setZoomed(false);
    setActiveId(items[next].id);
  }
  function share() {
    const selected = current;
    setShareId(selected.id);
    void action.run(async () => {
      if (!selected.attachment) throw new Error('MEDIA_MISSING');
      const media = await engine.media(selected.attachment);
      if (!media?.mime.startsWith('image/')) throw new Error('MEDIA_MISSING');
      const safeName = media.name.replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(-100) || 'photo';
      const file = new File(Paths.cache, `mnelo-gallery-${Date.now()}-${safeName}`);
      try {
        file.write(Uint8Array.from(atob(media.bytes), (value) => value.charCodeAt(0)));
        await Sharing.shareAsync(file.uri, { mimeType: media.mime });
      } finally {
        discardCachedMedia(file.uri);
      }
    });
  }
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <ScreenAppearance.Provider value="call">
          <StatusBar style="light" />
          <SafeAreaView
            style={styles.viewer}
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
          >
            <View style={styles.toolbar}>
              <IconButton icon="x" label={t('compose.close')} onPress={onClose} />
              <View style={ui.flex}>
                <AppText variant="label" numberOfLines={1}>
                  {current.name ?? name}
                </AppText>
                <AppText variant="caption">
                  {formatDate(new Date(current.sentAt).toISOString())} ·{' '}
                  {formatTime(new Date(current.sentAt).toISOString())}
                </AppText>
              </View>
            </View>
            <View
              style={ui.flex}
              testID="gallery-viewport"
              onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout)}
            >
              {viewport.width > 0 && (
                <FlatList
                  key={`${viewport.width}-${older.isPending || newer.isPending ? 'loading' : 'ready'}`}
                  ref={pager}
                  testID="gallery-pager"
                  data={items}
                  horizontal
                  pagingEnabled
                  initialScrollIndex={index}
                  getItemLayout={(_, position) => ({
                    length: viewport.width,
                    offset: position * viewport.width,
                    index: position,
                  })}
                  keyExtractor={(item) => item.id}
                  extraData={{ index, viewport }}
                  scrollEnabled={!zoomed && !action.busy}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={3}
                  maxToRenderPerBatch={3}
                  windowSize={3}
                  renderItem={({ item, index: position }) => (
                    <PhotoSlide
                      item={item}
                      width={viewport.width}
                      height={viewport.height}
                      selected={position === index}
                      nearby={Math.abs(position - index) <= 1}
                      onZoom={setZoomed}
                    />
                  )}
                  onMomentumScrollEnd={(event) =>
                    select(Math.round(event.nativeEvent.contentOffset.x / viewport.width))
                  }
                />
              )}
            </View>
            {(older.isError || newer.isError) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                onPress={() => {
                  void older.refetch();
                  void newer.refetch();
                }}
                style={styles.retry}
              >
                <AppText variant="caption">{t('library.photoLoadMore')}</AppText>
              </Pressable>
            )}
            <FlatList
              key={older.isPending || newer.isPending ? 'loading' : 'ready'}
              ref={strip}
              data={items}
              horizontal
              testID="gallery-strip"
              style={styles.strip}
              initialScrollIndex={Math.max(0, index - 4)}
              getItemLayout={(_, position) => ({
                length: 60,
                offset: position * 60,
                index: position,
              })}
              keyExtractor={(item) => item.id}
              extraData={{ index, busy: action.busy }}
              showsHorizontalScrollIndicator={false}
              initialNumToRender={9}
              maxToRenderPerBatch={6}
              windowSize={3}
              renderItem={({ item, index: position }) => (
                <PhotoThumbnail
                  item={item}
                  selected={position === index}
                  disabled={action.busy}
                  onPress={() => select(position)}
                />
              )}
              onScrollToIndexFailed={({ index: position }) =>
                strip.current?.scrollToOffset({ offset: position * 60, animated: false })
              }
            />
            <View style={styles.footer}>
              <IconButton
                icon="chevron-left"
                label={t('library.previousPhoto')}
                disabled={index === 0 || action.busy}
                onPress={() => select(index - 1)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('messenger.saveSharePhoto')}
                disabled={action.busy}
                accessibilityState={{ disabled: action.busy, busy: action.busy }}
                onPress={share}
                style={styles.share}
              >
                {action.busy ? (
                  <ActivityIndicator color={theme.colors.callText} />
                ) : (
                  <AppIcon name="share" />
                )}
                <AppText variant="caption" centered>
                  {t('messenger.saveSharePhoto')}
                </AppText>
              </Pressable>
              <IconButton
                icon="chevron-right"
                label={t('library.nextPhoto')}
                disabled={index === items.length - 1 || action.busy}
                onPress={() => select(index + 1)}
              />
            </View>
            {action.error && shareId === current.id && (
              <AppText accessibilityRole="alert">{action.error}</AppText>
            )}
          </SafeAreaView>
        </ScreenAppearance.Provider>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: theme.colors.callBackground },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  fullPhoto: { flexGrow: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md },
  strip: { flexGrow: 0, height: 60, marginTop: theme.spacing.sm },
  thumbnail: {
    width: 60,
    height: 60,
    padding: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { borderColor: theme.colors.accent },
  thumbnailImage: { width: '100%', height: '100%', borderRadius: theme.radii.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  share: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.controls.buttonHeight,
  },
  retry: { padding: theme.spacing.sm, minHeight: theme.controls.minTapTarget },
});
