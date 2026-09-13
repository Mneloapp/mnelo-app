import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { Button, Row } from '@/components/ui';
import { useLocalAction } from '../screens/shared';
import { mapLink } from '../map-link';

export function LocationMessage({ coordinates }: { coordinates: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const action = useLocalAction();
  function launch(provider: 'google' | 'apple') {
    void action.run(async () => {
      await Linking.openURL(mapLink(provider, coordinates));
      setOpen(false);
    });
  }
  return (
    <>
      <Button
        variant="secondary"
        label={t('messenger.openLocation')}
        onPress={() => setOpen(true)}
      />
      <ActionSheet
        visible={open}
        title={t('messenger.openLocation')}
        onClose={() => setOpen(false)}
      >
        <Row
          title={t('messenger.googleMaps')}
          left={<AppIcon name="map-pin" />}
          onPress={() => launch('google')}
        />
        {Platform.OS === 'ios' && (
          <Row
            title={t('messenger.appleMaps')}
            left={<AppIcon name="map" />}
            onPress={() => launch('apple')}
          />
        )}
        {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
        <Button variant="secondary" label={t('common.cancel')} onPress={() => setOpen(false)} />
      </ActionSheet>
    </>
  );
}
