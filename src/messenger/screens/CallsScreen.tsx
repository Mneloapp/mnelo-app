import { useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { IconButton, Page, StateView, ui } from '@/components/ui';
import { SearchField } from '@/components/SearchField';
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
  const [searchVisible, setSearchVisible] = useState(false);
  const [search, setSearch] = useState('');
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
      onTitlePress={() => setSearchVisible(true)}
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
      {searchVisible && (
        <View style={ui.row}>
          <View style={ui.flex}>
            <SearchField
              label={t('callSearch.placeholder')}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <IconButton
            icon="x"
            label={t('common.cancel')}
            onPress={() => {
              Keyboard.dismiss();
              setSearch('');
              setSearchVisible(false);
            }}
          />
        </View>
      )}
      {search.trim() ? (
        <CallContactSearch search={search} />
      ) : (
        <FlatList
          testID="calls-history"
          data={q.data?.pages.flat() ?? []}
          onScroll={(event) => {
            if (event.nativeEvent.contentOffset.y < -32) setSearchVisible(true);
          }}
          scrollEventThrottle={32}
          alwaysBounceVertical
          onRefresh={() => setSearchVisible(true)}
          refreshing={false}
          keyExtractor={(item) => item.id}
          initialNumToRender={12}
          windowSize={7}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <CallHistoryRow
              call={item}
              avatar={<PeerAvatar peer={item.peer} name={item.name} />}
              onPress={() => setSelected({ key: item.peer, name: item.name, history: item })}
            />
          )}
          ListEmptyComponent={<StateView loading={q.isPending} message={t('messenger.noCalls')} />}
          ListFooterComponent={
            q.isError ? (
              <StateView
                error={t('messenger.genericError')}
                onRetry={() => void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())}
              />
            ) : q.isFetchingNextPage ? (
              <StateView loading />
            ) : null
          }
        />
      )}
      {selected && <CallActions target={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}
export function NewCallScreen() {
  return <ContactPickerScreen mode="call" />;
}
