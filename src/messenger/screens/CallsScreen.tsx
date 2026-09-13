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
import { CallActions, CurrentCall, type CallTarget } from './CallActions';

export function CallsScreen() {
  const { engine, view } = useDevice();
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
        data={search.trim() ? [] : (q.data?.pages.flat() ?? [])}
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
                <Avatar name={item.name} group />
              ) : (
                <PeerAvatar peer={item.peer} name={item.name} />
              )
            }
            onPress={() => setSelected({ key: item.peer, name: item.name, history: item })}
          />
        )}
        ListEmptyComponent={
          search.trim() ? (
            <CallContactSearch search={search} embedded />
          ) : (
            <StateView loading={q.isPending} message={t('messenger.noCalls')} />
          )
        }
        ListFooterComponent={
          search.trim() ? null : q.isError ? (
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
