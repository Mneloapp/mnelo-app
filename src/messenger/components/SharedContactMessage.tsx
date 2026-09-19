import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import { readSharedContact } from '../contact-share';
import { resolveSharedContact } from '../shared-contact-action';
import { usePhoneAction } from '../screens/phone-shared';
import { devicePhoneClient } from '../phone-client';
import { addPhoneContact } from '../phonebook';

export function SharedContactMessage({
  body,
  enabled = true,
}: {
  body: string;
  enabled?: boolean;
}) {
  const { engine, enrollment, identity, calls } = useDevice();
  const { t } = useTranslation();
  const contact = readSharedContact(body);
  const action = usePhoneAction();
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const saved = savedPhone === contact.phone;
  const origin = useRef<object | null>(null);
  useFocusEffect(
    useCallback(() => {
      const scope = { body, enabled, engine, account: identity?.key };
      origin.current = scope;
      return () => {
        if (origin.current === scope) origin.current = null;
      };
    }, [body, engine, identity?.key, enabled]),
  );
  function run(kind: 'save' | 'message' | 'call') {
    const scope = origin.current;
    if (!enabled || !scope || !contact.phone) return;
    const current = () => origin.current === scope;
    void action.run(async () => {
      if (kind === 'save') {
        const result = await addPhoneContact(contact.phone!, contact.name, enrollment?.phone);
        if (current() && result) setSavedPhone(contact.phone);
        return;
      }
      const client = devicePhoneClient(engine.currentIdentity());
      if (!client) throw new Error('PHONE_REGISTRATION_REQUIRED');
      const target = await resolveSharedContact(engine, client, body, current);
      if (!current()) return;
      const call = calls?.snapshot();
      if (kind === 'call') {
        router.push({
          pathname: '/call/[id]',
          params:
            call && !['ended', 'failed'].includes(call.status)
              ? { id: call.chat }
              : { id: target.id, media: 'voice' },
        });
      } else router.push({ pathname: '/chat/[id]', params: { id: target.id } });
    });
  }
  return (
    <View style={styles.card}>
      {!!contact.name && <AppText variant="bodyMedium">{contact.name}</AppText>}
      {!!contact.phone && <AppText tone="secondary">{contact.phone}</AppText>}
      {enabled && contact.phone && (
        <>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              label={t('phone.startChat')}
              disabled={action.busy}
              onPress={() => run('message')}
            />
            <Button
              variant="secondary"
              label={t('messenger.callVoice')}
              disabled={action.busy}
              onPress={() => run('call')}
            />
          </View>
          <Button
            variant="secondary"
            label={t(saved ? 'phone.savedToPhone' : 'phone.saveToPhone')}
            disabled={saved || action.busy}
            onPress={() => run('save')}
          />
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
