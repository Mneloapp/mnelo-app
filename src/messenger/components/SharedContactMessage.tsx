import { useCallback, useRef } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import { presentPhoneContact, savedPhoneContact } from '../phonebook';
import { observePhonebook } from '../phonebook-events';
import { useQuery } from '@tanstack/react-query';

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
  const { fontScale } = useWindowDimensions();
  const stored = useQuery({
    queryKey: ['device', 'shared-phone-contact', contact.phone, enrollment?.phone],
    queryFn: () => savedPhoneContact(contact.phone!, enrollment?.phone),
    enabled: enabled && !!contact.phone,
    networkMode: 'always',
  });
  const saved = !!stored.data;
  const displayName = stored.data?.name || contact.name;
  const refresh = stored.refetch;
  const origin = useRef<object | null>(null);
  useFocusEffect(
    useCallback(() => {
      const scope = { body, enabled, engine, account: identity?.key };
      origin.current = scope;
      const update = () => {
        if (enabled && contact.phone) void refresh();
      };
      update();
      const stop = observePhonebook(update);
      const foreground = AppState.addEventListener('change', (state) => {
        if (state === 'active') update();
      });
      return () => {
        stop();
        foreground.remove();
        if (origin.current === scope) origin.current = null;
      };
    }, [body, engine, identity?.key, enabled, contact.phone, refresh]),
  );
  function run(kind: 'save' | 'message' | 'call') {
    const scope = origin.current;
    if (!enabled || !scope || !contact.phone) return;
    const current = () => origin.current === scope;
    void action.run(async () => {
      if (kind === 'save') {
        await presentPhoneContact(contact.phone!, displayName, enrollment?.phone);
        if (current()) await refresh();
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
      {!!displayName && <AppText variant="bodyMedium">{displayName}</AppText>}
      {!!contact.phone && <AppText tone="secondary">{contact.phone}</AppText>}
      {enabled && contact.phone && (
        <View style={[styles.actions, fontScale > 1.35 && { flexDirection: 'column' }]}>
          <ContactCardAction
            stacked={fontScale > 1.35}
            icon="message-circle"
            label={t('phone.startChat')}
            disabled={action.busy}
            onPress={() => run('message')}
          />
          <ContactCardAction
            stacked={fontScale > 1.35}
            icon="phone"
            label={t('phone.cardCall')}
            accessibilityLabel={t('messenger.callVoice')}
            disabled={action.busy}
            onPress={() => run('call')}
          />
          <ContactCardAction
            stacked={fontScale > 1.35}
            icon={saved ? 'check' : 'user-plus'}
            label={t(saved ? 'phone.cardContact' : 'common.save')}
            accessibilityLabel={t(saved ? 'phone.viewSavedContact' : 'phone.saveToPhone')}
            disabled={action.busy}
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
  stacked,
  label,
  accessibilityLabel = label,
  disabled,
  onPress,
}: {
  icon: IconName;
  stacked: boolean;
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
      style={({ pressed }) => [
        styles.action,
        stacked && { flexDirection: 'row', justifyContent: 'flex-start' },
        (disabled || pressed) && styles.dimmed,
      ]}
    >
      <View style={styles.icon}>
        <AppIcon name={icon} size={22} color={theme.colors.success} />
      </View>
      <AppText
        variant="caption"
        centered
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
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
