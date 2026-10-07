import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { LocalCall } from '../model';
import { theme } from '@/theme/tokens';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page, StateView, ui } from '@/components/ui';
import { FocusTabHeader } from '@/components/FocusTabHeader';
import { AppText } from '@/components/AppText';
import { formatDate } from '@/i18n/format';
import { useDayBoundary } from '@/hooks/useDayBoundary';
import { PullSearch, usePullSearch } from '@/components/PullSearch';
import { CallContactSearch } from '../components/CallContactSearch';
import { GroupAvatar, PeerAvatar } from '../components/ContactCard';
import { ContactPickerScreen } from './ContactPickerScreen';
import { useDevice } from '../DeviceProvider';
import { useVisibleRead } from '../useVisibleRead';
import { CallHistoryRow } from '../components/CallHistoryRow';
import { HistoryLoading } from '../components/HistoryLoading';
import { CallActions, CurrentCall, type CallTarget } from './CallActions';
import { RecentCalls } from '../components/RecentCalls';

export function CallsScreen() {
  const { engine, view, calls } = useDevice();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { listRef: searchListRef, ...searchBar } = usePullSearch<LocalCall | null>(search);
  const [selected, setSelected] = useState<CallTarget | null>(null);
  const today = useDayBoundary();
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
  function openCall(item: LocalCall, media = item.media) {
    const current = calls?.snapshot();
    router.push({
      pathname: '/call/[id]',
      params:
        current && !['ended', 'failed'].includes(current.status)
          ? { id: current.chat }
          : { id: item.chatId, media },
    });
  }
  function dayLabel(time: number) {
    const day = new Date(time);
    if (day.toDateString() === new Date(today).toDateString()) return t('focus.today');
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (day.toDateString() === yesterday.toDateString()) return t('focus.yesterday');
    return formatDate(day.toISOString());
  }
  return (
    <Page scroll={false} bottomSafe={false} contentStyle={ui.flex}>
      <FocusTabHeader
        title={t('tabs.calls')}
        actionLabel={t('messenger.newCall')}
        onAction={() => router.push('/new-call')}
        onTitlePress={searchBar.reveal}
        titleActionLabel={t('callSearch.open')}
      />
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
        data={[null, ...(search.trim() ? [] : rows)]}
        {...searchBar.scrollProps}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => item?.id ?? '$call-summary'}
        initialNumToRender={12}
        windowSize={7}
        onEndReached={() => {
          if (search.trim()) return;
          if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
        }}
        renderItem={({ item, index }) =>
          item ? (
            <View>
              {(index === 1 ||
                new Date(item.endedAt).toDateString() !==
                  new Date(rows[index - 2]!.endedAt).toDateString()) && (
                <AppText
                  variant="label"
                  tone="secondary"
                  accessibilityRole="header"
                  style={styles.dayHeading}
                >
                  {dayLabel(item.endedAt)}
                </AppText>
              )}
              <CallHistoryRow
                call={item}
                now={today}
                avatar={
                  item.group ? (
                    <GroupAvatar name={item.name} chat={item.chatId} />
                  ) : (
                    <PeerAvatar peer={item.peer} name={item.name} colorfulFallback />
                  )
                }
                onPress={() => openCall(item)}
                onInfo={() => setSelected({ key: item.peer, name: item.name, history: item })}
              />
            </View>
          ) : (
            <View testID="call-list-summary">
              {search.trim() ? (
                <CallContactSearch search={search} embedded />
              ) : (
                <>
                  <RecentCalls calls={rows} onCall={(call) => openCall(call, 'voice')} />
                  {rows.length === 0 &&
                    (q.isPending ? (
                      <HistoryLoading />
                    ) : (
                      <StateView
                        message={t('messenger.noCalls')}
                        error={q.isError ? t('messenger.genericError') : undefined}
                        {...(q.isError ? { onRetry: () => void q.refetch() } : {})}
                      />
                    ))}
                </>
              )}
            </View>
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
const styles = StyleSheet.create({
  dayHeading: { marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
});
