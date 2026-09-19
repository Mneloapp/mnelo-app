import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { sharedMapLink } from '../map-link';
import { useLocalAction } from '../screens/shared';

export function SharedMapMessage({ body }: { body: string }) {
  const target = sharedMapLink(body);
  const action = useLocalAction();
  const { t } = useTranslation();
  if (!target) return null;
  return (
    <>
      <Button
        variant="secondary"
        label={t(target.provider === 'google' ? 'messenger.googleMaps' : 'messenger.appleMaps')}
        busy={action.busy}
        onPress={() => void action.run(() => Linking.openURL(target.url))}
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </>
  );
}
