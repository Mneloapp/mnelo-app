import { useEffect, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Page, StateView } from '@/components/ui';
import { SettingsAction, SettingsCard, settingsStyles } from '../components/SettingsUI';
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
    <Page title={t('messenger.notifications')} back contentStyle={settingsStyles.page}>
      <SettingsCard title={t('messenger.notificationDelivery')} icon="bell">
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t(`messenger.background_${background}` as const)}
        </AppText>
        {background === 'unavailable' && (
          <SettingsAction
            icon="refresh-cw"
            label={t('common.retry')}
            busy={action.busy}
            onPress={() => void action.run(retryBackground)}
          />
        )}
      </SettingsCard>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('messenger.notificationUnavailable')} onRetry={() => void refetch()} />
      ) : (
        <>
          <SettingsCard
            title={t(
              !q.data?.supported
                ? 'messenger.notificationUnavailable'
                : q.data.allowed
                  ? 'messenger.notificationOn'
                  : 'messenger.notificationOff',
            )}
            icon={q.data?.allowed ? 'check-circle' : 'bell-off'}
          >
            <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
              {t(
                !q.data?.supported
                  ? 'messenger.notificationUnavailable'
                  : q.data.allowed
                    ? 'messenger.notificationEnabled'
                    : 'messenger.notificationDisabled',
              )}
            </AppText>
          </SettingsCard>
          <SettingsCard title={t('messenger.notificationPreviews')} icon="message-square">
            <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
              {t('messenger.notificationHint')}
            </AppText>
          </SettingsCard>
          {q.data?.supported && (
            <SettingsAction
              icon="settings"
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
