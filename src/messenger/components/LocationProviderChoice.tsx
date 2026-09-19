import { useRef } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { Row } from '@/components/ui';
import { AppIcon } from '@/components/AppIcon';

export function LocationProviderChoice({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (provider: 'apple' | 'google') => void;
}) {
  const { t } = useTranslation();
  const pending = useRef<'apple' | 'google' | null>(null);
  function choose(provider: 'apple' | 'google') {
    pending.current = provider;
    onClose();
  }
  return (
    <ActionSheet
      visible={visible}
      title={t('messenger.attachmentLocation')}
      onClose={() => {
        pending.current = null;
        onClose();
      }}
      onDismiss={() => {
        const provider = pending.current;
        pending.current = null;
        if (provider) onChoose(provider);
      }}
    >
      {Platform.OS === 'ios' && (
        <Row
          title={t('messenger.appleMaps')}
          subtitle={t('messenger.locationHint')}
          left={<AppIcon name="map" />}
          onPress={() => choose('apple')}
        />
      )}
      <Row
        title={t('messenger.googleMaps')}
        subtitle={t('messenger.googleMapsShareHint')}
        left={<AppIcon name="map-pin" />}
        onPress={() => choose('google')}
      />
    </ActionSheet>
  );
}
