import { theme } from '@/theme/tokens';
import { useState } from 'react';
import { Linking, Platform, Switch } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { registerNotifications, type RegistrationStatus } from './registration';
import { AppText } from '@/components/AppText';
import { Button, Page, Row, StateView } from '@/components/ui';
import { repository } from '@/services';
import { useAction } from '@/hooks/useAction';
import type { NotificationPreferences } from '@/types/domain';
export function NotificationsScreen() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => repository().notificationPreferences(),
  });
  const [draft, setDraft] = useState<NotificationPreferences>();
  const [status, setStatus] = useState<RegistrationStatus>();
  const settings = draft ?? q.data;
  const action = useAction();
  return (
    <Page title={t('me.notifications')} back>
      <AppText tone="secondary">{t('notifications.explanation')}</AppText>
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        settings && (
          <>
            {(['messages', 'requests', 'matches', 'calls'] as const).map((key) => (
              <Row
                key={key}
                title={t(`notifications.${key}`)}
                right={
                  <Switch
                    trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                    thumbColor={theme.colors.surface}
                    {...(Platform.OS === 'web' ? { activeThumbColor: theme.colors.surface } : {})}
                    hitSlop={theme.spacing.lg}
                    accessibilityLabel={t(`notifications.${key}`)}
                    disabled={action.busy}
                    value={settings[key]}
                    onValueChange={(value) => setDraft({ ...settings, [key]: value })}
                  />
                }
              />
            ))}
            <AppText tone="secondary">{t('notifications.privateCopy')}</AppText>
            <Button
              label={t('common.save')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  await repository().updateNotificationPreferences(settings);
                  await q.refetch();
                  setDraft(undefined);
                })
              }
            />
            <Button
              variant="secondary"
              label={t('notifications.enable')}
              disabled={action.busy}
              onPress={() =>
                void action.run(async () => setStatus(await registerNotifications(true)))
              }
            />
            {status && (
              <AppText accessibilityLiveRegion="polite">{t(`notifications.${status}`)}</AppText>
            )}
            {status === 'denied' && (
              <Button
                variant="secondary"
                label={t('notifications.openSettings')}
                onPress={() => void action.run(() => Linking.openSettings())}
              />
            )}
          </>
        )
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
