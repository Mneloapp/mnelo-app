import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { SheetAction } from '@/components/SheetAction';
import { usePhonebookAccess } from '../usePhonebookAccess';
import { managePhonebookAccess } from '../phonebook';
import { useLocalAction } from '../screens/shared';
import { InfoGroup } from './ContactInfo';

export function PhonebookAccess({ grouped = false }: { grouped?: boolean }) {
  const access = usePhonebookAccess();
  const action = useLocalAction();
  const { t } = useTranslation();
  if (access === 'unavailable' || access === 'available') return null;
  const Container = grouped ? InfoGroup : View;
  return (
    <Container>
      <SheetAction
        icon="users"
        label={t(
          access === 'limited'
            ? 'phone.selectContacts'
            : access === 'settings'
              ? 'phone.openContactsSettings'
              : 'phone.contactNames',
        )}
        disabled={action.busy}
        onPress={() => void action.run(managePhonebookAccess)}
      />
      <AppText variant="caption" tone="secondary">
        {t(access === 'limited' ? 'phone.limitedContactsHint' : 'phone.contactNamesHint')}
      </AppText>
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Container>
  );
}
