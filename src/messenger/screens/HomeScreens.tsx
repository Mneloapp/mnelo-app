import { useState } from 'react';
import { FlatList, View } from 'react-native';
import type { Chat } from '../model';
import { readGroupProfile } from '../group-profile';
import { avatarUri } from '../profile-avatar';
import { fallbackAvatarColor } from '../avatar-color';
import { theme } from '@/theme/tokens';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, IconButton, Page, StateView, ui } from '@/components/ui';
import { useDayBoundary } from '@/hooks/useDayBoundary';
import { useDevice } from '../DeviceProvider';
import { PullSearch, usePullSearch } from '@/components/PullSearch';
import { ChatHistoryRow } from '../components/ChatHistoryRow';
import { ChatFilters } from './ChatFilters';
import type { ChatCursor, ChatFilter } from '../engine';
import { callOutcomeCopy, readCallRecord } from '../call-record';
import { PeerAvatar } from '../components/ContactCard';
import { ContactRequests } from './ContactRequests';
import { HistoryLoading } from '../components/HistoryLoading';

export function ChatsScreen() {
  const { view } = useDevice();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { listRef: searchListRef, ...searchBar } = usePullSearch<Chat>(search);
  const today = useDayBoundary();
  const [filter, setFilter] = useState<ChatFilter>('all');
  const q = useInfiniteQuery({
    queryKey: ['device', 'chats', filter, search.trim()],
    queryFn: ({ pageParam }) => view.chatPage(filter, search, pageParam),
    initialPageParam: undefined as ChatCursor | undefined,
    getNextPageParam: (page) => page.next,
    networkMode: 'always',
  });
  const rows = q.data?.pages.flatMap((page) => page.rows) ?? [];
  return (
    <Page
      title={t('tabs.chats')}
      onTitlePress={searchBar.reveal}
      titleActionLabel={t('messenger.openChatSearch')}
      scroll={false}
      bottomSafe={false}
      contentStyle={ui.flex}
      right={
        <IconButton
          label={t('messenger.newMessage')}
          icon="edit"
          variant="soft"
          onPress={() => router.push('/new-message')}
        />
      }
    >
      <FlatList
        ref={searchListRef}
        testID="chats-list"
        showsVerticalScrollIndicator={false}
        {...searchBar.scrollProps}
        ListHeaderComponent={
          <View style={{ backgroundColor: theme.colors.background }}>
            <PullSearch
              label={t('messenger.searchChats')}
              value={search}
              onChangeText={setSearch}
              onFocusChange={searchBar.focus}
              onClose={searchBar.close}
              onLayout={searchBar.measureHeader}
            />
            <ChatFilters value={filter} onChange={setFilter} />
            <ContactRequests />
          </View>
        }
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
        }}
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <StateView loading />
          ) : q.isError && rows.length > 0 ? (
            <StateView
              error={t('messenger.genericError')}
              onRetry={() => void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())}
            />
          ) : null
        }
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => (
          <ChatHistoryRow
            chat={item}
            now={today}
            subtitle={
              item.previewKind === 'deleted'
                ? t('messenger.deletedMessage')
                : item.previewKind === 'call'
                  ? t(callOutcomeCopy[readCallRecord(item.preview).status])
                  : item.preview || (item.previewKind === 'contact' ? t('messenger.contact') : '')
            }
            avatar={
              item.kind === 'direct' && item.peer ? (
                <PeerAvatar peer={item.peer} name={item.title} colorfulFallback />
              ) : (
                <Avatar
                  name={item.title}
                  group
                  uri={avatarUri(readGroupProfile(item).avatar)}
                  fallbackRingColor={fallbackAvatarColor('group:' + item.id)}
                />
              )
            }
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          q.isPending ? (
            <HistoryLoading />
          ) : (
            <StateView
              error={q.isError ? t('messenger.genericError') : undefined}
              message={t(
                search.trim() || filter !== 'all' ? 'messenger.noChatResults' : 'messenger.noChats',
              )}
              {...(q.isError ? { onRetry: () => void q.refetch() } : {})}
            />
          )
        }
      />
    </Page>
  );
}
