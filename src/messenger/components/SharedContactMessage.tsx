import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
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
        <View style={styles.actions}>
          <ContactCardAction
            icon="message-circle"
            label={t('phone.startChat')}
            disabled={action.busy}
            onPress={() => run('message')}
          />
          <ContactCardAction
            icon="phone"
            label={t('phone.cardCall')}
            accessibilityLabel={t('messenger.callVoice')}
            disabled={action.busy}
            onPress={() => run('call')}
          />
          <ContactCardAction
            icon={saved ? 'check' : 'user-plus'}
            label={t(saved ? 'phone.cardSaved' : 'common.save')}
            accessibilityLabel={t(saved ? 'phone.savedToPhone' : 'phone.saveToPhone')}
            disabled={saved || action.busy}
            onPress={() => run('save')}
          />
        </View>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
function ContactCardAction({
  icon,
  label,
  accessibilityLabel = label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (disabled || pressed) && styles.dimmed]}
    >
      <View style={styles.icon}>
        <AppIcon name={icon} size={22} color={theme.colors.success} />
      </View>
      <AppText variant="caption" centered>
        {label}
      </AppText>
    </FocusPressable>
  );
}
const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.controlBorder,
  },
  action: {
    flex: 1,
    minWidth: 48,
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: theme.opacity.disabled },
});
