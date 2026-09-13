import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Row, StateView, ui } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { useLocalAction } from './shared';

export function ContactRequests() {
  const { engine, mesh } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const requests = useQuery({
    queryKey: ['device', 'contact-requests'],
    queryFn: () => engine.contactRequests(),
    networkMode: 'always',
  });
  if (requests.isError)
    return (
      <StateView error={t('messenger.genericError')} onRetry={() => void requests.refetch()} />
    );
  if (!requests.data?.length) return null;
  return (
    <View style={ui.stack}>
      <AppText variant="bodyMedium">{t('messenger.messageRequests')}</AppText>
      <AppText tone="secondary">{t('messenger.messageRequestHint')}</AppText>
      {requests.data.map((request) => (
        <View key={request.public_key} style={ui.stack}>
          <Row title={request.phone} />
          <View style={ui.row}>
            <Button
              label={t('messenger.acceptRequest')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const id = await engine.acceptContactRequest(request.public_key);
                  await mesh?.focus(request.public_key);
                  router.push({ pathname: '/chat/[id]', params: { id } });
                })
              }
            />
            <Button
              label={t('messenger.blockRequest')}
              variant="secondary"
              disabled={action.busy}
              onPress={() => void action.run(() => engine.rejectContactRequest(request.public_key))}
            />
          </View>
        </View>
      ))}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
