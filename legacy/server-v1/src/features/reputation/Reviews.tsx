import { formatDate, formatNumber } from '@/i18n/format';
import { FlatList } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Page, Section, StateView } from '@/components/ui';
import { repository } from '@/services';
import { encodeCursor } from '@/features/chats/cursor';
import type { Profile } from '@/types/domain';
export function ProfileReputation({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['verifications', profile.id],
    queryFn: () => repository().verifications(profile.id),
  });
  return (
    <Section title={t('profile.reputation')}>
      <AppText tone="secondary">
        {profile.reviewCount && profile.averageRating !== null
          ? t('profile.reviewSummary', {
              count: profile.reviewCount,
              rating: formatNumber(profile.averageRating),
            })
          : t('profile.noReviews')}
      </AppText>
      {profile.reviewCount > 0 && (
        <Button
          variant="secondary"
          label={t('reputation.viewReviews')}
          onPress={() => router.push({ pathname: '/reviews/[id]', params: { id: profile.id } })}
        />
      )}
      {q.data?.map((v) => (
        <AppText key={v.type}>{t(`reputation.verification.${v.type}`)}</AppText>
      ))}
    </Section>
  );
}
export function ReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const q = useInfiniteQuery({
    queryKey: ['reviews', id],
    queryFn: ({ pageParam }) => repository().reviews(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 20 && last ? encodeCursor(last.createdAt, last.id) : undefined;
    },
  });
  const seen = new Set<string>();
  const data = q.data?.pages.flat().filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return (
    <Page title={t('profile.reputation')} back scroll={false}>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError && !data ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => r.id}
          renderItem={({ item: r }) => (
            <Section title={t('reputation.rating', { rating: r.rating })}>
              <AppText tone="secondary">
                {t(`reputation.purpose.${r.purpose}`)} · {formatDate(r.createdAt)}
              </AppText>
              {r.own && <AppText tone="secondary">{t('reputation.yourReview')}</AppText>}
              {r.comment && <AppText>{r.comment}</AppText>}
            </Section>
          )}
          ListEmptyComponent={<StateView message={t('profile.noReviews')} />}
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
