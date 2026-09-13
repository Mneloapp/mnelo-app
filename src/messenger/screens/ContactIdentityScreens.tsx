import { useState } from 'react';
import { Share, View } from 'react-native';
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
import { ContactCard, CardDetails, cardStyles } from '../components/ContactCard';
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
  const { identity, profile } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [copied, setCopied] = useState(false);
  return (
    <Page nativeHeader>
      {identity && (
        <>
          <ContactCard name={identity.name} profile={profile} />
          <View style={cardStyles.card}>
            <ContactQR value={contactLink(identity)} label={t('card.qr')} />
            <AppText centered variant="caption" tone="secondary">
              {t('card.qrHint')}
            </AppText>
          </View>
          <Button
            label={t('card.share')}
            onPress={() =>
              void action.run(async () => {
                await Share.share({
                  message: t('card.invitation', { link: contactLink(identity) }),
                });
              })
            }
          />
          <Button
            variant="secondary"
            label={copied ? t('card.copied') : t('card.copy')}
            onPress={() =>
              void action.run(async () => {
                await Clipboard.setStringAsync(contactLink(identity));
                setCopied(true);
              })
            }
          />
          <Button
            variant="secondary"
            label={t('card.scan')}
            onPress={() => router.push('/scan-contact')}
          />
          <CardDetails profile={profile} />
          <AppText variant="caption" tone="secondary">
            {t('card.privateHint')}
          </AppText>
          <Section title={t('card.key')}>
            <AppText selectable variant="caption">
              {'mnelo1:' + identity.key}
            </AppText>
          </Section>
          {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
        </>
      )}
    </Page>
  );
}
