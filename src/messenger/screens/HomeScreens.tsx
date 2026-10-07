import { useState } from 'react';
import { FlatList, View } from 'react-native';
import type { Chat } from '../model';
import { readGroupProfile } from '../group-profile';
import { avatarUri } from '../profile-avatar';
import { fallbackAvatarColor } from '../avatar-color';
import { theme } from '@/theme/tokens';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, Page, StateView, ui } from '@/components/ui';
import { FocusTabHeader } from '@/components/FocusTabHeader';
import { ActionSheet } from '@/components/ActionSheet';
import { SheetAction } from '@/components/SheetAction';
import { AppText } from '@/components/AppText';
import { useDayBoundary } from '@/hooks/useDayBoundary';
import { useDevice } from '../DeviceProvider';
import { PullSearch, usePullSearch } from '@/components/PullSearch';
import { ChatSwipeActions } from '../components/ChatSwipeActions';
import { ChatHistoryRow } from '../components/ChatHistoryRow';
import { ChatFilters } from './ChatFilters';
import type { ChatCursor, ChatFilter } from '../engine';
import { callOutcomeCopy, readCallRecord } from '../call-record';
import { PeerAvatar } from '../components/ContactCard';
import { ContactRequests } from './ContactRequests';
import { HistoryLoading } from '../components/HistoryLoading';
import { PinnedChats } from '../components/PinnedChats';
import { chatPins, useChatPins } from '../chat-pins';
import { separatePinnedChats } from '../chat-pins-core';
import { useAttentionCounts } from '../attention';

export function ChatsScreen() {
  const { view, identity } = useDevice();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { listRef: searchListRef, ...searchBar } = usePullSearch<Chat | null>(search);
  const today = useDayBoundary();
  const [filter, setFilter] = useState<ChatFilter>('all');
  const [managed, setManaged] = useState<Chat | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const pins = useChatPins(identity?.key);
  const attention = useAttentionCounts();
  const pinnedQuery = useQuery({
    queryKey: ['device', 'pinned-chats', identity?.key, pins.ids],
    enabled: Boolean(identity) && pins.ready && pins.ids.length > 0,
    queryFn: async () => {
      const owner = identity!.key;
      const chats = await Promise.all(pins.ids.map((id) => view.chat(id)));
      // Only a successful database read can remove a deleted pin. Failed reads
      // retain the preference, so a temporary storage outage cannot lose pins.
      const missing = pins.ids.filter((_id, index) => !chats[index]);
      if (missing.length) await chatPins.remove(owner, missing);
      return chats.filter((chat): chat is Chat => Boolean(chat));
    },
    networkMode: 'always',
  });
  const q = useInfiniteQuery({
    queryKey: ['device', 'chats', filter, search.trim()],
    queryFn: ({ pageParam }) => view.chatPage(filter, search, pageParam),
    initialPageParam: undefined as ChatCursor | undefined,
    getNextPageParam: (page) => page.next,
    networkMode: 'always',
  });
  const rows = q.data?.pages.flatMap((page) => page.rows) ?? [];
  const pinned = filter === 'all' && !search.trim() ? (pinnedQuery.data ?? []) : [];
  const visibleRows = separatePinnedChats(rows, pinned);
  const openChat = (chat: Chat) => router.push({ pathname: '/chat/[id]', params: { id: chat.id } });
  const subtitle = (chat: Chat) =>
    chat.previewKind === 'deleted'
      ? t('messenger.deletedMessage')
      : chat.previewKind === 'call'
        ? t(callOutcomeCopy[readCallRecord(chat.preview).status])
        : chat.preview || (chat.previewKind === 'contact' ? t('messenger.contact') : '');
  const avatar = (chat: Chat) =>
    chat.kind === 'direct' && chat.peer ? (
      <PeerAvatar peer={chat.peer} name={chat.title} colorfulFallback />
    ) : (
      <Avatar
        name={chat.title}
        group
        uri={avatarUri(readGroupProfile(chat).avatar)}
        fallbackRingColor={fallbackAvatarColor('group:' + chat.id)}
      />
    );
  function manage(chat: Chat) {
    setPinError('');
    setManaged(chat);
  }
  async function togglePin() {
    if (!identity || !managed || pinBusy) return;
    setPinBusy(true);
    setPinError('');
    try {
      await chatPins.toggle(identity.key, managed.id);
      setManaged(null);
    } catch (error) {
      setPinError(
        t(
          error instanceof Error && error.message === 'CHAT_PIN_LIMIT'
            ? 'focus.pinLimit'
            : 'messenger.genericError',
        ),
      );
    } finally {
      setPinBusy(false);
    }
  }
  return (
    <Page scroll={false} bottomSafe={false} contentStyle={ui.flex}>
      <FocusTabHeader
        title={t('tabs.chats')}
        subtitle={
          attention.data?.messages
            ? t('messenger.unreadCount', { count: attention.data.messages })
            : undefined
        }
        actionLabel={t('messenger.newMessage')}
        onAction={() => router.push('/new-message')}
        onTitlePress={searchBar.reveal}
        titleActionLabel={t('messenger.openChatSearch')}
      />
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
          </View>
        }
        // Only search is a sticky header. The first ordinary cell keeps the
        // filters and pins in document flow, ahead of the conversation rows.
        data={[null, ...visibleRows]}
        keyExtractor={(row) => row?.id ?? '$chat-summary'}
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
        renderItem={({ item }) =>
          item ? (
            <ChatSwipeActions id={item.id} title={item.title}>
              {(actions) => (
                <ChatHistoryRow
                  {...actions}
                  chat={item}
                  now={today}
                  subtitle={subtitle(item)}
                  avatar={avatar(item)}
                  onPress={() => openChat(item)}
                  onPin={() => manage(item)}
                />
              )}
            </ChatSwipeActions>
          ) : (
            <View testID="chat-list-summary">
              <ChatFilters value={filter} onChange={setFilter} />
              <ContactRequests />
              <PinnedChats
                chats={pinned}
                avatar={avatar}
                subtitle={subtitle}
                onPress={openChat}
                onManage={manage}
              />
              {visibleRows.length === 0 &&
                pinned.length === 0 &&
                (q.isPending ? (
                  <HistoryLoading />
                ) : (
                  <StateView
                    error={q.isError ? t('messenger.genericError') : undefined}
                    message={t(
                      search.trim() || filter !== 'all'
                        ? 'messenger.noChatResults'
                        : 'messenger.noChats',
                    )}
                    {...(q.isError ? { onRetry: () => void q.refetch() } : {})}
                  />
                ))}
            </View>
          )
        }
      />
      {managed && (
        <ActionSheet visible title={managed.title} onClose={() => !pinBusy && setManaged(null)}>
          <SheetAction
            icon="bookmark"
            label={t(pins.ids.includes(managed.id) ? 'focus.unpinChat' : 'focus.pinChat')}
            disabled={pinBusy}
            onPress={() => void togglePin()}
          />
          {pinError && <AppText accessibilityRole="alert">{pinError}</AppText>}
          <SheetAction
            icon="x"
            label={t('common.cancel')}
            disabled={pinBusy}
            onPress={() => setManaged(null)}
          />
        </ActionSheet>
      )}
    </Page>
  );
}
