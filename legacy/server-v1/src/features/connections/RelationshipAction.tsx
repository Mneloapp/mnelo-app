import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
export function useRelationship(target: string, matchingRequestId?: string) {
  return useQuery({
    queryKey: ['relationship', target, matchingRequestId],
    queryFn: () => repository().relationship(target, matchingRequestId),
    refetchOnMount: 'always',
  });
}
export function RelationshipAction({
  target,
  matchingRequestId,
}: {
  target: string;
  matchingRequestId?: string | undefined;
}) {
  const { t } = useTranslation();
  const q = useRelationship(target, matchingRequestId);
  const a = useAction();
  if (q.isPending) return <StateView loading />;
  if (q.isError)
    return <StateView error={t('requests.unavailable')} onRetry={() => void q.refetch()} />;
  return (
    <>
      {q.data.connected ? (
        <Button
          label={t('requests.messageAction')}
          busy={a.busy}
          onPress={() =>
            void a.run(
              () => repository().openDirectConversation(target),
              (id) => router.push({ pathname: '/chat/[id]', params: { id } }),
            )
          }
        />
      ) : q.data.pendingRequestId ? (
        <Button
          variant="secondary"
          label={t(q.data.incoming ? 'requests.review' : 'requests.sent')}
          onPress={() => router.push('/requests')}
        />
      ) : q.data.canRequest ? (
        <Button
          variant="connect"
          label={t('tabs.connect')}
          onPress={() =>
            router.push({
              pathname: '/request/[id]',
              params: { id: target, ...(matchingRequestId ? { needId: matchingRequestId } : {}) },
            })
          }
        />
      ) : (
        <AppText tone="secondary">{t('requests.unavailable')}</AppText>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </>
  );
}
