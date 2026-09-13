import { formatDate } from '@/i18n/format';
import { FlatList } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Page, Row, StateView } from '@/components/ui';
import { repository } from '@/services';
import { encodeCursor } from '@/features/chats/cursor';
export function HistoryScreen() {
  const { t } = useTranslation();
  const q = useInfiniteQuery({
    queryKey: ['completed-connections'],
    queryFn: ({ pageParam }) => repository().completedConnections(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 30 && last?.completedAt
        ? encodeCursor(last.completedAt, last.id)
        : undefined;
    },
  });
  const seen = new Set<string>();
  const data = q.data?.pages.flat().filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return (
    <Page title={t('reputation.history')} back scroll={false}>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError && !data ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={({ item: c }) => (
            <Row
              title={c.displayName}
              subtitle={c.completedAt ? formatDate(c.completedAt) : ''}
              onPress={() =>
                router.push({ pathname: '/connection/[id]', params: { id: c.conversationId } })
              }
            />
          )}
          ListEmptyComponent={<StateView message={t('reputation.noHistory')} />}
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
