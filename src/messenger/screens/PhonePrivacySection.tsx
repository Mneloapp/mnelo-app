import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Section, StateView } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { usePhoneAction, usePhoneService } from './phone-shared';
import { Check } from './shared';

export function PhonePrivacySection() {
  const { engine } = useDevice();
  const { client, status } = usePhoneService();
  const { t } = useTranslation();
  const action = usePhoneAction();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Section title={t('phone.title')}>
      {client && status.data?.registered && (
        <>
          <AppText tone="secondary">{t('phone.discoveryDefault')}</AppText>
          <Check
            value={Boolean(status.data.discoverable)}
            label={t('phone.discoverable')}
            onChange={(discoverable) =>
              void action.run(async () => {
                await client.execute({ action: 'visibility', discoverable });
                await status.refetch();
              })
            }
          />
          <Check value={confirmed} label={t('phone.unlinkConfirm')} onChange={setConfirmed} />
          <Button
            variant="danger"
            label={t('phone.unlink')}
            disabled={!confirmed}
            busy={action.busy}
            onPress={() =>
              void action.run(async () => {
                const response = await client.execute({ action: 'unlink' });
                if (response.ok !== true) throw new Error('PHONE_REQUEST_FAILED');
                await engine.rememberPhone(null);
              })
            }
          />
        </>
      )}
      <StateView
        loading={Boolean(client) && status.isPending}
        error={status.isError ? t('phone.failed') : undefined}
        onRetry={() => void status.refetch()}
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Section>
  );
}
