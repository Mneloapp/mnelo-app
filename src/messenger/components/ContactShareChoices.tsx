import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, ui } from '@/components/ui';
import type { Contact } from '../model';
import { encodeSharedContact, shareableContactPhone } from '../contact-share';

export function ContactShareChoices({
  contacts,
  busy,
  onShare,
}: {
  contacts: readonly Contact[];
  busy: boolean;
  onShare: (body: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {contacts
        .filter((contact) => !contact.blocked)
        .map((contact) => {
          const phone = shareableContactPhone(contact);
          return (
            <View key={contact.key} style={ui.choiceStack}>
              <Button
                variant="secondary"
                label={[contact.name, phone].filter(Boolean).join('\n')}
                busy={busy}
                disabled={!phone}
                onPress={() => onShare(encodeSharedContact(contact))}
              />
              {!phone && (
                <AppText variant="caption" tone="secondary">
                  {t('messenger.contactPhoneUnavailable')}
                </AppText>
              )}
            </View>
          );
        })}
    </>
  );
}
