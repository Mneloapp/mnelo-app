import { FlatList } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Page, Section, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import { encodeCursor } from '@/features/chats/cursor';
export function BlockedScreen() {
  const { t } = useTranslation();
  const a = useAction();
  const cache = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['blocked'],
    queryFn: ({ pageParam }) => repository().blockedProfiles(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 20 && last ? encodeCursor(last.createdAt, last.id) : undefined;
    },
  });
  const seen = new Set<string>();
  const data = q.data?.pages.flat().filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return (
    <Page title={t('moderation.blockedPeople')} back scroll={false}>
      <AppText tone="secondary">{t('moderation.unblockNotice')}</AppText>
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      {q.isPending ? (
        <StateView loading />
      ) : q.isError && !data ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          renderItem={({ item: p }) => (
            <Section title={p.displayName}>
              <AppText tone="secondary">{'@' + p.username}</AppText>
              <Button
                variant="secondary"
                label={t('moderation.unblock')}
                busy={a.busy}
                onPress={() =>
                  void a.run(async () => {
                    await repository().unblock(p.userId);
                    void cache.resetQueries();
                  })
                }
              />
              <Button
                variant="secondary"
                label={t('moderation.report')}
                onPress={() => router.push({ pathname: '/report/[id]', params: { id: p.userId } })}
              />
            </Section>
          )}
          ListEmptyComponent={<StateView message={t('moderation.noBlocked')} />}
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
