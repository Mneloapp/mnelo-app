import { useState } from 'react';
import { FlatList, View } from 'react-native';
import type { Chat } from '../model';
import { theme } from '@/theme/tokens';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Field, IconButton, Page, StateView, ui } from '@/components/ui';
import { useDayBoundary } from '@/hooks/useDayBoundary';
import { AppText } from '@/components/AppText';
import { useDevice } from '../DeviceProvider';
import { Check, useLocalAction } from './shared';
import { useComposer } from './composer-navigation';
import { PullSearch, usePullSearch } from '@/components/PullSearch';
import { ChatHistoryRow } from '../components/ChatHistoryRow';
import { ChatFilters } from './ChatFilters';
import type { ChatCursor, ChatFilter } from '../engine';
import { callOutcomeCopy, readCallRecord } from '../call-record';
import { PeerAvatar } from '../components/ContactCard';
import { ContactRequests } from './ContactRequests';

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
                  : item.preview
            }
            avatar={
              item.kind === 'direct' && item.peer ? (
                <PeerAvatar peer={item.peer} name={item.title} />
              ) : (
                <Avatar name={item.title} />
              )
            }
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          <StateView
            loading={q.isPending}
            error={q.isError ? t('messenger.genericError') : undefined}
            message={t(
              search.trim() || filter !== 'all' ? 'messenger.noChatResults' : 'messenger.noChats',
            )}
            {...(q.isError ? { onRetry: () => void q.refetch() } : {})}
          />
        }
      />
    </Page>
  );
}
export function NewGroupScreen() {
  const { engine, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const { finish } = useComposer();
  return (
    <Page nativeHeader>
      <Field label={t('messenger.groupName')} value={name} onChangeText={setName} maxLength={80} />
      <AppText tone="secondary">{t('messenger.groupHint')}</AppText>
      {q.data
        ?.filter((contact) => !contact.blocked)
        .map((contact) => (
          <Check
            key={contact.key}
            label={contact.name}
            value={selected.includes(contact.key)}
            onChange={(checked) =>
              setSelected((value) =>
                checked
                  ? [...value, contact.key].slice(0, 15)
                  : value.filter((key) => key !== contact.key),
              )
            }
          />
        ))}
      <Button
        label={t('messenger.createGroup')}
        disabled={!name.trim() || !selected.length}
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            const id = await engine.createGroup(name, selected);
            finish({ pathname: '/chat/[id]', params: { id } });
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
