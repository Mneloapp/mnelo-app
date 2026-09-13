import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Choice, Field, Page, Row, Section, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import type { ConnectionDetails } from '@/types/domain';
function Completion({ connection: c }: { connection: ConnectionDetails }) {
  const { t } = useTranslation();
  const a = useAction();
  const cache = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [reviewing, setReviewing] = useState(false);
  async function refresh() {
    for (const key of [
      'connection-details',
      'completed-connections',
      'profile',
      'reviews',
      'matches',
    ])
      await cache.invalidateQueries({ queryKey: [key] });
  }
  if (c.purpose === 'social') return <AppText tone="secondary">{t('reputation.social')}</AppText>;
  return (
    <Section title={t('reputation.completion')}>
      <AppText>
        {t(
          c.completedAt
            ? 'reputation.completed'
            : c.confirmedByMe
              ? 'reputation.waiting'
              : c.confirmedByPeer
                ? 'reputation.peerConfirmed'
                : 'reputation.completionNotice',
        )}
      </AppText>
      {!c.confirmedByMe &&
        (confirm ? (
          <>
            <AppText>{t('reputation.confirmNotice')}</AppText>
            <Button
              label={t('reputation.confirm')}
              busy={a.busy}
              onPress={() =>
                void a.run(async () => {
                  await repository().confirmCompletion(c.id);
                  await refresh();
                })
              }
            />
            <Button
              variant="secondary"
              label={t('common.cancel')}
              disabled={a.busy}
              onPress={() => setConfirm(false)}
            />
          </>
        ) : (
          <Button
            variant="secondary"
            label={t('reputation.markComplete')}
            onPress={() => setConfirm(true)}
          />
        ))}
      {c.review ? (
        <Section title={t('reputation.yourReview')}>
          <AppText>{t('reputation.rating', { rating: c.review.rating })}</AppText>
          {c.review.comment && <AppText>{c.review.comment}</AppText>}
        </Section>
      ) : c.completedAt ? (
        reviewing ? (
          <>
            <AppText>{t('reputation.reviewNotice')}</AppText>
            <Choice
              value={rating}
              onChange={setRating}
              options={[1, 2, 3, 4, 5].map((value) => ({
                value: String(value),
                label: t('reputation.rating', { rating: value }),
              }))}
            />
            <Field
              label={t('reputation.comment')}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={1000}
              editable={!a.busy}
            />
            <Button
              label={t('reputation.publish')}
              disabled={!rating}
              busy={a.busy}
              onPress={() =>
                void a.run(async () => {
                  await repository().submitReview(c.id, Number(rating), comment);
                  await refresh();
                })
              }
            />
            <Button
              variant="secondary"
              label={t('common.cancel')}
              disabled={a.busy}
              onPress={() => setReviewing(false)}
            />
          </>
        ) : (
          <Button label={t('reputation.writeReview')} onPress={() => setReviewing(true)} />
        )
      ) : null}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Section>
  );
}
export function ConnectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['connection-details', id],
    queryFn: () => repository().connectionDetails(id),
    refetchOnMount: 'always',
  });
  return (
    <Page title={t('reputation.connection')} back>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Row
            title={q.data.displayName}
            subtitle={'@' + q.data.username}
            onPress={() =>
              router.push({ pathname: '/profile/[id]', params: { id: q.data.peerId } })
            }
          />
          {q.data.context && (
            <Section title={t('requests.reason')}>
              <AppText>{q.data.context}</AppText>
            </Section>
          )}
          <Completion key={q.data.id} connection={q.data} />
          <Button
            variant="secondary"
            label={t('requests.messageAction')}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id } })}
          />
        </>
      )}
    </Page>
  );
}
