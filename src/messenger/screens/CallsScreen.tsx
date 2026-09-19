import { useState } from 'react';
import { FlatList, View } from 'react-native';
import type { LocalCall } from '../model';
import { theme } from '@/theme/tokens';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, IconButton, Page, StateView, ui } from '@/components/ui';
import { PullSearch, usePullSearch } from '@/components/PullSearch';
import { CallContactSearch } from '../components/CallContactSearch';
import { PeerAvatar } from '../components/ContactCard';
import { ContactPickerScreen } from './ContactPickerScreen';
import { useDevice } from '../DeviceProvider';
import { useVisibleRead } from '../useVisibleRead';
import { CallHistoryRow } from '../components/CallHistoryRow';
import { HistoryLoading } from '../components/HistoryLoading';
import { fallbackAvatarColor } from '../avatar-color';
import { CallActions, CurrentCall, type CallTarget } from './CallActions';

export function CallsScreen() {
  const { engine, view, calls } = useDevice();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { listRef: searchListRef, ...searchBar } = usePullSearch<LocalCall>(search);
  const [selected, setSelected] = useState<CallTarget | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['device', 'call-history'],
    queryFn: ({ pageParam }) => view.callHistory(pageParam),
    initialPageParam: Number.MAX_SAFE_INTEGER,
    getNextPageParam: (page) => (page.length === 40 ? page.at(-1)?.sequence : undefined),
    networkMode: 'always',
  });
  const rows = q.data?.pages.flat() ?? [];
  const newest = q.data?.pages[0]?.[0]?.sequence;
  useVisibleRead(engine, null, newest);
  return (
    <Page
      title={t('tabs.calls')}
      onTitlePress={searchBar.reveal}
      titleActionLabel={t('callSearch.open')}
      scroll={false}
      bottomSafe={false}
      contentStyle={ui.flex}
      right={
        <IconButton
          icon="plus"
          variant="soft"
          label={t('messenger.newCall')}
          onPress={() => router.push('/new-call')}
        />
      }
    >
      <CurrentCall />
      <FlatList
        ref={searchListRef}
        ListHeaderComponent={
          <View style={{ backgroundColor: theme.colors.background }}>
            <PullSearch
              label={t('callSearch.placeholder')}
              value={search}
              onChangeText={setSearch}
              onFocusChange={searchBar.focus}
              onClose={searchBar.close}
              onLayout={searchBar.measureHeader}
            />
          </View>
        }
        testID="calls-history"
        showsVerticalScrollIndicator={false}
        data={search.trim() ? [] : rows}
        {...searchBar.scrollProps}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        windowSize={7}
        onEndReached={() => {
          if (search.trim()) return;
          if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
        }}
        renderItem={({ item }) => (
          <CallHistoryRow
            call={item}
            avatar={
              item.group ? (
                <Avatar
                  name={item.name}
                  group
                  fallbackRingColor={fallbackAvatarColor('group:' + item.chatId)}
                />
              ) : (
                <PeerAvatar peer={item.peer} name={item.name} colorfulFallback />
              )
            }
            onPress={() => {
              const current = calls?.snapshot();
              router.push({
                pathname: '/call/[id]',
                params:
                  current && !['ended', 'failed'].includes(current.status)
                    ? { id: current.chat }
                    : { id: item.chatId, media: item.media },
              });
            }}
            onInfo={() => setSelected({ key: item.peer, name: item.name, history: item })}
          />
        )}
        ListEmptyComponent={
          search.trim() ? (
            <CallContactSearch search={search} embedded />
          ) : q.isPending ? (
            <HistoryLoading />
          ) : (
            <StateView
              message={t('messenger.noCalls')}
              error={q.isError ? t('messenger.genericError') : undefined}
              {...(q.isError ? { onRetry: () => void q.refetch() } : {})}
            />
          )
        }
        ListFooterComponent={
          search.trim() ? null : q.isError && rows.length > 0 ? (
            <StateView
              error={t('messenger.genericError')}
              onRetry={() => void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())}
            />
          ) : q.isFetchingNextPage ? (
            <StateView loading />
          ) : null
        }
      />
      {selected && <CallActions target={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
export function NewCallScreen() {
  return <ContactPickerScreen mode="call" />;
}
