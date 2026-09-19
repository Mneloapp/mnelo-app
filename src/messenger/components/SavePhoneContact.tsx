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
  // Unknown is not proof that the person is missing from Contacts. Keep only
  // this optional action hidden while permission and the local scan settle.
  const [checked, setChecked] = useState<{
    phone: string;
    ownNumber: string | undefined;
    access: typeof access;
    saved: boolean;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const refresh = () => {
      const requested = ++generation;
      setChecked(null);
      if (access !== 'available' && access !== 'limited') return;
      void hasPhoneContact(phone, ownNumber)
        .then((exists) => {
          if (alive && requested === generation)
            setChecked({ phone, ownNumber, access, saved: exists });
        })
        .catch(() => {
          // A failed scan must not advertise a duplicate-save action.
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
  if (
    !checked ||
    checked.phone !== phone ||
    checked.ownNumber !== ownNumber ||
    checked.access !== access ||
    checked.saved
  )
    return null;
  return (
    <InfoGroup>
      <SheetAction
        icon="user-plus"
        label={t('phone.saveToPhone')}
        disabled={action.busy}
        onPress={() =>
          void action.run(async () => {
            const saved = await addPhoneContact(phone, name, ownNumber);
            setChecked({ phone, ownNumber, access, saved });
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </InfoGroup>
  );
}
