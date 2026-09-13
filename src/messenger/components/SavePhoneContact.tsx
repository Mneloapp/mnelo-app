import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { SheetAction } from '@/components/SheetAction';
import { addPhoneContact, hasPhoneContact } from '../phonebook';
import { observePhonebook } from '../phonebook-events';
import { usePhonebookAccess } from '../usePhonebookAccess';
import { usePhoneAction } from '../screens/phone-shared';
import { InfoGroup } from './ContactInfo';

export function SavePhoneContact({
  phone,
  name,
  ownNumber,
}: {
  phone: string;
  name: string;
  ownNumber?: string | undefined;
}) {
  const { t } = useTranslation();
  const access = usePhonebookAccess();
  const action = usePhoneAction();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const refresh = () => {
      const requested = ++generation;
      void hasPhoneContact(phone, ownNumber)
        .catch(() => false)
        .then((exists) => {
          if (alive && requested === generation) setSaved(exists);
        });
    };
    refresh();
    const changes = observePhonebook(refresh);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      changes();
      foreground.remove();
    };
  }, [phone, ownNumber, access]);
  if (access === 'unavailable' || saved) return null;
  return (
    <InfoGroup>
      <SheetAction
        icon="user-plus"
        label={t('phone.saveToPhone')}
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            setSaved(await addPhoneContact(phone, name, ownNumber));
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </InfoGroup>
  );
}
