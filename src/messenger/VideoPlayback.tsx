import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { ui } from '@/components/ui';
export function VideoPlayback({ uri }: { uri: string }) {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  return (
    <View style={ui.flex}>
      <video
        src={uri}
        controls
        autoPlay
        playsInline
        onError={() => setError(true)}
        style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'contain' }}
      />
      {error && <AppText accessibilityRole="alert">{t('messenger.videoUnavailable')}</AppText>}
    </View>
  );
}
