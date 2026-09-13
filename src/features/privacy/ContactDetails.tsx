import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Section } from '@/components/ui';
import { repository } from '@/services';
import { useAction } from '@/hooks/useAction';
export function ContactDetails({ target }: { target: string }) {
  const { t } = useTranslation();
  const a = useAction();
  // Deliberately not Query-cache or persistent storage. Late responses after leaving are discarded.
  const [phone, setPhone] = useState<string | null>();
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = useCallback(() => {
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    setPhone(undefined);
  }, []);
  useFocusEffect(useCallback(() => clear, [clear]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') clear();
    });
    return () => sub.remove();
  }, [clear]);
  return (
    <Section title={t('privacy.contactDetails')}>
      {phone === undefined ? (
        <Button
          variant="secondary"
          label={t('privacy.revealPhone')}
          busy={a.busy}
          onPress={() => {
            const current = ++epoch.current;
            void a.run(
              () => repository().revealPhone(target),
              (result) => {
                if (current !== epoch.current) return;
                setPhone(result);
                timer.current = setTimeout(clear, 30000);
              },
            );
          }}
        />
      ) : phone ? (
        <>
          <AppText selectable>{phone}</AppText>
          <AppText tone="secondary">{t('privacy.phoneEphemeral')}</AppText>
          <Button variant="secondary" label={t('privacy.hidePhone')} onPress={clear} />
        </>
      ) : (
        <AppText tone="secondary">{t('privacy.phoneUnavailable')}</AppText>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Section>
  );
}
