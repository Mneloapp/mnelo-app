import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { getSharedPayloads, clearSharedPayloads, type SharePayload } from 'expo-sharing';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Field, IconButton, Page, Row, StateView, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import {
  discardIncoming,
  incomingItems,
  prepareIncoming,
  type IncomingItem,
} from '../incoming-share';
import type { Chat } from '../model';
import type { ChatCursor } from '../engine';

function read() {
  try {
    return getSharedPayloads();
  } catch {
    return [];
  }
}
const signature = (items: readonly SharePayload[]) => JSON.stringify(items);

export function IncomingShares() {
  const { authenticated } = useDevice();
  const [payloads, setPayloads] = useState<SharePayload[] | null>(null);
  const pending = useRef<SharePayload[] | null>(null);
  const sending = useRef(false);
  const { t } = useTranslation();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    function refresh() {
      if (pending.current) return;
      const next = read();
      if (!next.length) return;
      pending.current = next;
      setPayloads(next);
    }
    refresh();
    const state = AppState.addEventListener('change', (value) => {
      if (value === 'active') refresh();
    });
    const links = Linking.addEventListener('url', refresh);
    return () => {
      state.remove();
      links.remove();
    };
  }, []);
  function finish() {
    if (!payloads || sending.current) return;
    if (signature(read()) === signature(payloads)) clearSharedPayloads();
    discardIncoming(payloads);
    const next = read();
    pending.current = next.length ? next : null;
    setPayloads(pending.current);
  }
  if (!payloads || !authenticated) return null;
  let items: IncomingItem[] = [];
  let invalid = false;
  try {
    items = incomingItems(payloads);
  } catch {
    invalid = true;
  }
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={finish}>
      <SafeAreaProvider>
        {invalid ? (
          <Page
            title={t('incomingShare.title')}
            right={<IconButton icon="x" label={t('common.cancel')} onPress={finish} />}
          >
            <AppText accessibilityRole="alert">{t('incomingShare.invalid')}</AppText>
          </Page>
        ) : (
          <ShareReview
            key={signature(payloads)}
            items={items}
            onClose={finish}
            onBusy={(value) => {
              sending.current = value;
            }}
          />
        )}
      </SafeAreaProvider>
    </Modal>
  );
}

export function ShareReview({
  items,
  onClose,
  onBusy,
}: {
  onBusy?: (busy: boolean) => void;
  items: readonly IncomingItem[];
  onClose: () => void;
}) {
  const { engine, view } = useDevice();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Chat | null>(null);
  const [sent, setSent] = useState(0);
  const committed = useRef(0);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const chats = useInfiniteQuery({
    queryKey: ['device', 'share-chats', search],
    queryFn: ({ pageParam }) => view.chatPage('all', search, pageParam),
    initialPageParam: undefined as ChatCursor | undefined,
    getNextPageParam: (page) => page.next,
    networkMode: 'always',
  });
  async function send() {
    if (!selected || locked.current) return;
    locked.current = true;
    onBusy?.(true);
    setBusy(true);
    setError(false);
    try {
      for (let i = committed.current; i < items.length; i++) {
        const message = await prepareIncoming(items[i]!);
        await engine.send(selected.id, message.body, {
          kind: message.kind,
          ...(message.media ? { media: message.media } : {}),
        });
        committed.current = i + 1;
        setSent(i + 1);
      }
      onBusy?.(false);
      onClose();
    } catch {
      setError(true);
    } finally {
      locked.current = false;
      onBusy?.(false);
      setBusy(false);
    }
  }
  return (
    <Page
      title={t('incomingShare.title')}
      scroll={false}
      contentStyle={ui.flex}
      right={<IconButton icon="x" label={t('common.cancel')} disabled={busy} onPress={onClose} />}
    >
      <ScrollView horizontal style={styles.previews} contentContainerStyle={styles.previewContent}>
        {items.map((item) => (
          <View key={item.id} style={styles.preview}>
            {item.image && item.uri && (
              <Image
                source={{ uri: item.uri }}
                accessibilityLabel={item.label}
                style={styles.image}
              />
            )}
            <AppText variant="caption" numberOfLines={3}>
              {item.label}
            </AppText>
          </View>
        ))}
      </ScrollView>
      <AppText variant="caption" tone="secondary">
        {t('incomingShare.choose')}
      </AppText>
      <Field
        label={t('incomingShare.search')}
        value={search}
        onChangeText={setSearch}
        editable={!busy && sent === 0}
      />
      <FlatList
        data={
          chats.data?.pages.flatMap((page) => page.rows).filter((chat) => !chat.left_group) ?? []
        }
        style={ui.flex}
        keyExtractor={(chat) => chat.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Row
            title={item.title}
            accessibilityLabel={item.title}
            right={selected?.id === item.id ? <AppText>✓</AppText> : undefined}
            onPress={() => {
              if (!busy && committed.current === 0) setSelected(item);
            }}
          />
        )}
        onEndReached={() => {
          if (chats.hasNextPage && !chats.isFetching && !chats.isError) void chats.fetchNextPage();
        }}
        ListEmptyComponent={
          <StateView
            loading={chats.isPending}
            error={chats.isError ? t('messenger.genericError') : undefined}
            message={t('incomingShare.empty')}
            onRetry={() => void chats.refetch()}
          />
        }
      />
      {selected && (
        <AppText variant="caption">{t('incomingShare.to', { name: selected.title })}</AppText>
      )}
      {error && (
        <AppText accessibilityRole="alert" variant="caption">
          {t('incomingShare.failed', { sent, total: items.length })}
        </AppText>
      )}
      <Button
        label={t('common.send')}
        disabled={!selected || !items.length}
        busy={busy}
        onPress={() => void send()}
      />
    </Page>
  );
}
const styles = StyleSheet.create({
  previews: { maxHeight: 144, flexGrow: 0 },
  previewContent: { gap: theme.spacing.sm },
  preview: {
    width: 144,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radii.md,
  },
  image: { width: 128, height: 88, resizeMode: 'cover' },
});
