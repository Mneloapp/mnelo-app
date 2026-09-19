import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { Button, Field, ui } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { coordinateBody } from '../location-coordinate';
import { mapLink } from '../map-link';

// Platforms without MapKit can select any coordinate, preview it in Maps and
// explicitly send it. Neither this picker nor map preview requests GPS access.
export function LocationComposer({
  close,
  send,
  busy,
  error,
}: {
  close: () => void;
  send: (body: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  let body: string | null = null;
  try {
    if (latitude.trim() && longitude.trim())
      body = coordinateBody({ latitude: Number(latitude), longitude: Number(longitude) });
  } catch {
    /* The send button stays disabled until both coordinates are valid. */
  }
  return (
    <ActionSheet
      visible
      compact
      avoidKeyboard
      title={t('messenger.attachmentLocation')}
      onClose={() => {
        if (!busy) close();
      }}
      footer={
        <Button
          label={t('messenger.sendLocation')}
          variant="accent"
          busy={busy}
          disabled={!body}
          onPress={() => {
            if (body) send(body);
          }}
        />
      }
    >
      <View style={ui.stack}>
        <AppText variant="caption" tone="secondary">
          {t('messenger.locationCoordinatesHint')}
        </AppText>
        <Field
          label={t('messenger.latitude')}
          value={latitude}
          onChangeText={setLatitude}
          editable={!busy}
          maxLength={24}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label={t('messenger.longitude')}
          value={longitude}
          onChangeText={setLongitude}
          editable={!busy}
          maxLength={24}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <Button
          label={t('messenger.openLocation')}
          variant="secondary"
          disabled={!body || busy}
          onPress={() => {
            if (body) void Linking.openURL(mapLink('google', body)).catch(() => undefined);
          }}
        />
        {error && <AppText accessibilityRole="alert">{error}</AppText>}
      </View>
    </ActionSheet>
  );
}
