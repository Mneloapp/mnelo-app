import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Avatar, Button, Field, Page, Row, Section, StateView, ui } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { useProfile } from '@/hooks/useRepository';
import { useDebounced } from '@/hooks/useDebounced';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import { encodeCursor } from '@/features/chats/cursor';
import { ProfileAvatar } from '@/features/profiles/ProfileAvatar';
import type { ConnectionRequest } from '@/types/domain';
function RequestRow({ request: r }: { request: ConnectionRequest }) {
  const { t } = useTranslation();
  const self = useSession((s) => s.session?.userId);
  const incoming = r.recipientId === self;
  const p = useProfile(incoming ? r.senderId : r.recipientId);
  const a = useAction();
  const cache = useQueryClient();
  function respond(action: 'accept' | 'decline' | 'cancel') {
    void a.run(
      () => repository().respondRequest(r.id, action),
      (chatId) => {
        void cache.invalidateQueries({ queryKey: ['requests'] });
        void cache.invalidateQueries({ queryKey: ['relationship'] });
        void cache.invalidateQueries({ queryKey: ['connections'] });
        void cache.invalidateQueries({ queryKey: ['conversations'] });
        if (chatId) router.push({ pathname: '/chat/[id]', params: { id: chatId } });
      },
    );
  }
  return (
    <Section title={t(`requests.status.${r.status}`)}>
      <Row
        title={p.data?.displayName ?? t('profile.title')}
        left={<Avatar name={p.data?.displayName ?? ''} />}
      />
      <AppText>{r.context}</AppText>
      {r.message && <AppText>{r.message}</AppText>}
      {r.status === 'pending' && (
        <View style={ui.horizontal}>
          {incoming ? (
            <>
              <View style={ui.flex}>
                <Button
                  variant="connect"
                  label={t('requests.accept')}
                  busy={a.busy}
                  onPress={() => respond('accept')}
                />
              </View>
              <View style={ui.flex}>
                <Button
                  variant="secondary"
                  label={t('requests.decline')}
                  busy={a.busy}
                  onPress={() => respond('decline')}
                />
              </View>
            </>
          ) : (
            <Button
              variant="secondary"
              label={t('common.cancel')}
              busy={a.busy}
              onPress={() => respond('cancel')}
            />
          )}
        </View>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Section>
  );
}

export function ConnectionsScreen() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const q = useQuery({
    queryKey: ['connections', debounced],
    queryFn: () => repository().connections(debounced),
  });
  const a = useAction();
  return (
    <Page title={t('me.connections')} back scroll={false}>
      <Field
        label={t('chats.searchPeople')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        maxLength={60}
      />
      <Row title={t('reputation.history')} onPress={() => router.push('/completed-connections')} />
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p }) => (
            <Row
              title={p.displayName}
              subtitle={'@' + p.username}
              left={<ProfileAvatar profile={p} />}
              onPress={() =>
                void a.run(
                  () => repository().openDirectConversation(p.id),
                  (id) => router.push({ pathname: '/chat/[id]', params: { id } }),
                )
              }
            />
          )}
          ListEmptyComponent={<StateView message={t('requests.noConnections')} />}
          ListFooterComponent={
            q.data.length === 50 ? (
              <AppText tone="secondary">{t('requests.refineSearch')}</AppText>
            ) : null
          }
        />
      )}
    </Page>
  );
}
export function RequestsScreen() {
  const { t } = useTranslation();
  const q = useInfiniteQuery({
    queryKey: ['requests'],
    queryFn: ({ pageParam }) => repository().requests(pageParam),
    initialPageParam: undefined as string | undefined,
    refetchOnMount: 'always',
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 30 && last ? encodeCursor(last.createdAt, last.id) : undefined;
    },
  });
  const seen = new Set<string>();
  const data = q.data?.pages.flat().filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return (
    <Page title={t('me.requests')} back scroll={false}>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError && !data ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <RequestRow request={item} />}
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<StateView message={t('requests.empty')} />}
          ListFooterComponent={
            q.isFetchNextPageError ? (
              <StateView error={t('common.loadError')} onRetry={() => void q.fetchNextPage()} />
            ) : q.hasNextPage ? (
              <Button
                variant="secondary"
                label={t('common.loadMore')}
                busy={q.isFetchingNextPage}
                onPress={() => void q.fetchNextPage()}
              />
            ) : null
          }
        />
      )}
    </Page>
  );
}
