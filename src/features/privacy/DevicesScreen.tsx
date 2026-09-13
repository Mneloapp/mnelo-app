import { formatDate, formatTime } from '@/i18n/format';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { repository } from '@/services';
import { AppText } from '@/components/AppText';
import { Button, Page, Row, Section, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { encodeCursor } from '@/features/chats/cursor';
export function DevicesScreen() {
  const { t } = useTranslation();
  const action = useAction();
  const [confirm, setConfirm] = useState(false),
    [done, setDone] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ['devices'],
    queryFn: ({ pageParam }) => repository().devices(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length >= 20 && last ? encodeCursor(last.createdAt, last.id) : undefined;
    },
    refetchInterval: 30000,
  });
  const seen = new Set<string>();
  const devices =
    q.data?.pages.flat().filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    }) ?? [];
  return (
    <Page title={t('me.devices')} back>
      <AppText tone="secondary">{t('devices.explanation')}</AppText>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : !devices.length ? (
        <StateView message={t('devices.empty')} />
      ) : (
        devices.map((d) => (
          <Section key={d.id} title={t(d.current ? 'devices.current' : 'devices.other')}>
            <Row
              title={d.label || t('devices.unknown')}
              subtitle={[d.platform, d.osVersion].filter(Boolean).join(' ')}
            />
            <AppText variant="caption" tone="secondary">
              {t('devices.lastActive', {
                date: formatDate(d.lastActiveAt) + ', ' + formatTime(d.lastActiveAt),
              })}
            </AppText>
          </Section>
        ))
      )}
      {q.hasNextPage && (
        <Button
          label={t('devices.loadMore')}
          variant="secondary"
          busy={q.isFetchingNextPage}
          onPress={() => void q.fetchNextPage()}
        />
      )}
      <Button
        label={t('devices.revoke')}
        variant="secondary"
        busy={action.busy}
        onPress={() => void action.run(() => repository().logout())}
      />
      {devices.some((d) => !d.current) &&
        (confirm ? (
          <Section title={t('devices.revokeOthers')}>
            <AppText>{t('devices.confirmOthers')}</AppText>
            <Button
              label={t('devices.revokeOthers')}
              variant="danger"
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  await repository().revokeOtherDevices();
                  setConfirm(false);
                  setDone(true);
                  await q.refetch();
                })
              }
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              disabled={action.busy}
              onPress={() => setConfirm(false)}
            />
          </Section>
        ) : (
          <Button
            label={t('devices.revokeOthers')}
            variant="danger"
            disabled={action.busy}
            onPress={() => {
              setDone(false);
              setConfirm(true);
            }}
          />
        ))}
      {done && <AppText accessibilityLiveRegion="polite">{t('devices.revokedOthers')}</AppText>}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
