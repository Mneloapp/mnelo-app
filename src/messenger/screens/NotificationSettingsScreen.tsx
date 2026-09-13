import { useEffect, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Page, StateView } from '@/components/ui';
import { useAppActive } from '@/hooks/useAppActive';
import { alertPermission, requestAlerts } from '../device-alerts';
import { useLocalAction } from './shared';
import { backgroundSnapshot, observeBackground, retryBackground } from '../background-status';
export function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const action = useLocalAction();
  const background = useSyncExternalStore(
    observeBackground,
    backgroundSnapshot,
    backgroundSnapshot,
  );
  const active = useAppActive();
  const q = useQuery({
    queryKey: ['device', 'alert-permission'],
    queryFn: alertPermission,
    networkMode: 'always',
  });
  const { refetch } = q;
  useEffect(() => {
    if (active) void refetch();
  }, [active, refetch]);
  return (
    <Page title={t('messenger.notifications')} back>
      <AppText>{t('messenger.notificationHint')}</AppText>
      <AppText tone="secondary">{t(`messenger.background_${background}` as const)}</AppText>
      {background === 'unavailable' && (
        <Button label={t('common.retry')} onPress={() => void action.run(retryBackground)} />
      )}
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('messenger.notificationUnavailable')} onRetry={() => void refetch()} />
      ) : (
        <>
          <AppText tone="secondary">
            {t(
              !q.data?.supported
                ? 'messenger.notificationUnavailable'
                : q.data.allowed
                  ? 'messenger.notificationEnabled'
                  : 'messenger.notificationDisabled',
            )}
          </AppText>
          {q.data?.supported && (
            <Button
              label={t(
                !q.data.allowed && q.data.canAsk
                  ? 'messenger.notificationEnable'
                  : 'messenger.notificationSettings',
              )}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  if (q.data.canAsk && !q.data.allowed) {
                    await requestAlerts();
                    await refetch();
                    await retryBackground();
                  } else await Linking.openSettings();
                })
              }
            />
          )}
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
