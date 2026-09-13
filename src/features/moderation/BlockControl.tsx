import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Section } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
export function BlockControl({ target, disabled = false }: { target: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const a = useAction();
  const cache = useQueryClient();
  return confirm ? (
    <Section title={t('moderation.block')}>
      <AppText>{t('moderation.blockExplanation')}</AppText>
      <Button
        variant="danger"
        label={t('moderation.confirmBlock')}
        busy={a.busy}
        disabled={disabled}
        onPress={() =>
          void a.run(async () => {
            await repository().block(target);
            router.replace('/(tabs)/chats');
            void cache.resetQueries();
          })
        }
      />
      <Button
        variant="secondary"
        label={t('common.cancel')}
        disabled={a.busy || disabled}
        onPress={() => setConfirm(false)}
      />
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Section>
  ) : (
    <Button variant="danger" label={t('moderation.block')} onPress={() => setConfirm(true)} />
  );
}
