import { useState } from 'react';
import { Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Field, Page, Section } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { peerKey } from '../model';
import { Check, useLocalAction } from './shared';
import { useComposer } from './composer-navigation';
import { ContactQR } from '../components/ContactQR';
import { cardStyles } from '../components/ContactCard';
import { FocusPressable as Pressable } from '@/components/FocusPressable';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { ActionSheet } from '@/components/ActionSheet';
import { theme } from '@/theme/tokens';
import { contactLink } from '../contact-link';

export function ContactCodeScreen() {
  const { engine, identity } = useDevice();
  const { t } = useTranslation();
  const { returnToPicker } = useComposer();
  const action = useLocalAction();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const parsedCode = code
    .trim()
    .replace(/^mnelo1:/, '')
    .toLowerCase();
  return (
    <Page nativeHeader>
      <Field
        label={t('messenger.contactName')}
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      <Field
        label={t('messenger.contactCode')}
        value={code}
        onChangeText={(value) => {
          setCode(value);
          setConfirmed(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={80}
      />
      <AppText tone="secondary">{t('messenger.contactHint')}</AppText>
      <Check value={confirmed} label={t('messenger.confirmed')} onChange={setConfirmed} />
      <Button
        label={t('common.save')}
        disabled={
          !name.trim() ||
          !peerKey.safeParse(parsedCode).success ||
          !confirmed ||
          parsedCode === identity?.key
        }
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            const existing = (await engine.contacts()).find(
              (contact) => contact.key === parsedCode,
            );
            if (existing?.blocked) throw new Error('CONTACT_BLOCKED');
            await engine.trustContact({ name, key: parsedCode });
            returnToPicker();
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
export function MyCodeScreen() {
  const { identity } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [copied, setCopied] = useState(false);
  const [details, setDetails] = useState(false);
  const { height, fontScale } = useWindowDimensions();
  const accessibleScroll = fontScale > 1.3 || height < 600;
  const [cardHeight, setCardHeight] = useState(360);
  return (
    <Page nativeHeader scroll={accessibleScroll} contentStyle={styles.page}>
      {identity && (
        <>
          <View
            style={[
              cardStyles.card,
              {
                flex: accessibleScroll ? undefined : 1,
                maxHeight: accessibleScroll ? undefined : 380,
                padding: theme.spacing.xl,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
            onLayout={({ nativeEvent }) => setCardHeight(nativeEvent.layout.height)}
          >
            <ContactQR
              value={contactLink(identity)}
              label={t('card.qr')}
              maxSize={accessibleScroll ? 220 : Math.max(120, cardHeight - 48)}
            />
          </View>
          <AppText centered tone="secondary">
            {t('card.qrHint')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('card.scan')}
            onPress={() => router.push('/scan-contact')}
            style={({ pressed }) => [styles.scan, pressed && styles.pressed]}
          >
            <AppIcon name="maximize" />
            <AppText centered variant="button">
              {t('card.scan')}
            </AppText>
          </Pressable>
          <View style={styles.actions}>
            <CodeAction
              icon="share"
              disabled={action.busy}
              label={t('card.share')}
              onPress={() =>
                void action.run(async () => {
                  await Share.share({
                    message: t('card.invitation', { link: contactLink(identity) }),
                  });
                })
              }
            />
            <CodeAction
              icon={copied ? 'check' : 'link'}
              disabled={action.busy}
              label={copied ? t('card.copied') : t('card.copy')}
              onPress={() =>
                void action.run(async () => {
                  await Clipboard.setStringAsync(contactLink(identity));
                  setCopied(true);
                })
              }
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDetails(true)}
            style={({ pressed }) => [styles.details, pressed && styles.pressed]}
          >
            <AppText centered variant="caption" tone="secondary">
              {t('card.key')}
            </AppText>
          </Pressable>
          <ActionSheet
            visible={details}
            title={t('card.key')}
            onClose={() => setDetails(false)}
            compact
          >
            <AppText variant="caption" tone="secondary">
              {t('card.privateHint')}
            </AppText>
            <Section title={t('card.key')}>
              <AppText selectable variant="caption">
                {'mnelo1:' + identity.key}
              </AppText>
            </Section>
          </ActionSheet>
          {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
        </>
      )}
    </Page>
  );
}

function CodeAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && styles.pressed]}
    >
      <View style={styles.actionIcon}>
        <AppIcon name={icon} size={26} />
      </View>
      <AppText centered variant="label">
        {label}
      </AppText>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, gap: theme.spacing.lg, padding: theme.spacing.xl, justifyContent: 'center' },
  scan: {
    minHeight: 56,
    padding: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  action: { flex: 1, alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.xs },
  actionIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
  },
  details: {
    minHeight: theme.controls.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: theme.opacity.pressed },
});
