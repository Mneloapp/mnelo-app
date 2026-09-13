import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Button,
  Choice,
  Field,
  Page,
  Section,
  SettingsRow,
  StateView,
} from '@/components/ui';
import { PhonePrivacySection } from './PhonePrivacySection';
import { usePhoneService } from './phone-shared';
import { AppText } from '@/components/AppText';
import { usePreferences } from '@/stores/preferences';
import { useDevice } from '../DeviceProvider';
import { bytesToHex, openArchive, sealArchive } from '../crypto';
import { Check, useLocalAction } from './shared';
import { discardCachedMedia } from '@/features/chats/media-files';
import { isReviewPhone } from '../review-account';
import { ContactCard, cardStyles } from '../components/ContactCard';
import { deliveryV2 } from '../delivery-mode';
export { EditProfileScreen } from './LocalProfileScreen';

export function MeScreen() {
  const { identity, profile, enrollment } = useDevice();
  const { t } = useTranslation();
  return (
    <Page
      title={t('tabs.me')}
      bottomSafe={false}
      right={
        <IconButton
          icon="grid"
          label={t('card.qr')}
          variant="soft"
          onPress={() => router.push({ pathname: '/my-code', params: { from: 'me' } })}
        />
      }
    >
      {enrollment?.testOnly && isReviewPhone(enrollment.phone) && (
        <AppText tone="secondary">{t('phone.reviewNotice')}</AppText>
      )}
      {identity && (
        <ContactCard name={identity.name} profile={profile}>
          <Button
            label={t('card.edit')}
            variant="secondary"
            onPress={() => router.push('/edit-profile')}
          />
          <Button
            label={t('card.share')}
            variant="primary"
            onPress={() => router.push({ pathname: '/my-code', params: { from: 'me' } })}
          />
        </ContactCard>
      )}
      <Section title={t('messenger.settings')}>
        <View style={cardStyles.settings}>
          <SettingsRow
            title={t('messenger.notifications')}
            icon="bell"
            onPress={() => router.push('/notifications')}
          />
          <SettingsRow
            title={t('phone.changeNumber')}
            icon="phone"
            onPress={() => router.push('/phone')}
          />
          <SettingsRow
            title={t('messenger.contacts')}
            icon="users"
            onPress={() => router.push({ pathname: '/new-message', params: { from: 'me' } })}
          />
          <SettingsRow
            title={t('messenger.privacy')}
            icon="shield"
            onPress={() => router.push('/privacy')}
          />
        </View>
        <View style={cardStyles.settings}>
          <SettingsRow
            title={t('messenger.backups')}
            icon="download"
            onPress={() => router.push('/backups')}
          />
          <SettingsRow
            title={t('messenger.blocked')}
            icon="slash"
            onPress={() => router.push('/blocked')}
          />
          <SettingsRow
            title={t('messenger.settings')}
            icon="settings"
            onPress={() => router.push('/account')}
          />
        </View>
      </Section>
    </Page>
  );
}
export function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t('messenger.privacy')} back>
      <PhonePrivacySection />
      <AppText>{t('messenger.privacyHint')}</AppText>
      <AppText tone="secondary">{t('messenger.offlineHint')}</AppText>
      <AppText tone="secondary">{t('messenger.backupResponsibility')}</AppText>
      <Button
        variant="secondary"
        label={t('messenger.backups')}
        onPress={() => router.push('/backups')}
      />
    </Page>
  );
}
export function BlockedScreen() {
  const { engine, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const q = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const blocked = q.data?.filter((contact) => contact.blocked);
  return (
    <Page title={t('messenger.blocked')} back>
      {blocked?.map((contact) => (
        <Section key={contact.key} title={contact.name}>
          <Button
            variant="secondary"
            label={t('messenger.unblock')}
            busy={action.busy}
            onPress={() => void action.run(() => engine.block(contact.key, false))}
          />
        </Section>
      ))}
      {blocked?.length === 0 && <StateView message={t('messenger.noBlocked')} />}
      <StateView
        loading={q.isPending}
        error={q.isError ? t('messenger.genericError') : undefined}
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
export function AccountScreen() {
  const { engine } = useDevice();
  const { client } = usePhoneService();
  const [unlinkNumber, setUnlinkNumber] = useState(false);
  const { t } = useTranslation();
  const action = useLocalAction();
  const [confirmed, setConfirmed] = useState(false);
  const locale = usePreferences((state) => state.locale);
  return (
    <Page title={t('messenger.settings')} back>
      <Section title={t('account.language')}>
        <Choice
          value={locale}
          onChange={(value) => void action.run(() => usePreferences.getState().setLocale(value))}
          options={[
            { value: 'en', label: t('account.english') },
            { value: 'ka', label: t('account.georgian') },
          ]}
        />
      </Section>
      <SettingsRow
        title={t('messenger.openSource')}
        icon="code"
        onPress={() => router.push('/open-source')}
      />
      <Section title={t('messenger.eraseDevice')}>
        <AppText>{t('messenger.eraseHint')}</AppText>
        <Check
          value={unlinkNumber}
          label={t('messenger.eraseNumberToo')}
          onChange={setUnlinkNumber}
        />
        <Check value={confirmed} label={t('messenger.eraseConfirmed')} onChange={setConfirmed} />
        <Button
          variant="danger"
          label={t('messenger.eraseDevice')}
          disabled={!confirmed}
          busy={action.busy}
          onPress={() =>
            void action.run(async () => {
              if (unlinkNumber) {
                if (!client) throw new Error('PHONE_REQUEST_FAILED');
                const registration = await client.execute({ action: 'status' });
                if (typeof registration.registered !== 'boolean')
                  throw new Error('PHONE_REQUEST_FAILED');
                if (registration.registered) {
                  const result = await client.execute({ action: 'unlink' });
                  if (result.ok !== true) throw new Error('PHONE_REQUEST_FAILED');
                }
              }
              await engine.eraseLocalData();
              router.replace('/');
            })
          }
        />
      </Section>
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
export function BackupsScreen() {
  const { engine } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [key, setKey] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  useEffect(
    () => () => {
      if (uri) discardCachedMedia(uri);
    },
    [uri],
  );
  return (
    <Page title={t('messenger.backups')} back>
      <Section title={t('messenger.backupOff')}>
        <AppText>{t('messenger.backupHint')}</AppText>
        <AppText tone="secondary">{t('messenger.backupResponsibility')}</AppText>
        {deliveryV2 && <AppText>{t('messenger.backupRecoveryPending')}</AppText>}
      </Section>
      <Button
        label={t('messenger.exportBackup')}
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            const recovery = bytesToHex(getRandomBytes(32));
            const snapshot = new TextEncoder().encode(await engine.snapshot());
            const encrypted = sealArchive(snapshot, recovery, getRandomBytes);
            const file = new File(Paths.cache, 'mnelo-backup-' + randomUUID() + '.mnelo');
            file.write(encrypted);
            setKey(recovery);
            setUri(file.uri);
            setSaved(false);
            setShared(false);
          })
        }
      />
      {key && uri && (
        <Section title={t('messenger.recoveryKey')}>
          <AppText selectable>{key}</AppText>
          <AppText>{t('messenger.recoveryHint')}</AppText>
          <Button
            variant="secondary"
            label={t('messenger.copy')}
            onPress={() =>
              void action.run(async () => {
                await Clipboard.setStringAsync(key);
              })
            }
          />
          <Check value={saved} label={t('messenger.keySaved')} onChange={setSaved} />
          <Button
            label={t('messenger.saveBackup')}
            disabled={!saved}
            busy={action.busy}
            onPress={() =>
              void action.run(async () => {
                await Sharing.shareAsync(uri, {
                  mimeType: 'application/octet-stream',
                  dialogTitle: t('messenger.saveBackup'),
                });
                setShared(true);
              })
            }
          />
        </Section>
      )}
      {shared && <AppText accessibilityLiveRegion="polite">{t('messenger.backupShared')}</AppText>}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
export function RestoreScreen() {
  const { engine } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [key, setKey] = useState('');
  const [uri, setUri] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (uri) discardCachedMedia(uri);
    },
    [uri],
  );
  if (deliveryV2)
    return (
      <Page title={t('messenger.restore')} back>
        <AppText accessibilityRole="alert">{t('messenger.backupRecoveryPending')}</AppText>
      </Page>
    );
  return (
    <Page title={t('messenger.restore')} back>
      <AppText>{t('messenger.restoreHint')}</AppText>
      <Button
        variant="secondary"
        label={t('messenger.chooseBackup')}
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: '*/*',
              copyToCacheDirectory: true,
              multiple: false,
            });
            if (!result.canceled && result.assets[0]) setUri(result.assets[0].uri);
          })
        }
      />
      {uri && <AppText>{new File(uri).name}</AppText>}
      <Field
        label={t('messenger.recoveryKey')}
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        maxLength={64}
      />
      <Button
        label={t('messenger.restoreNow')}
        disabled={!uri || !/^[a-f0-9]{64}$/.test(key)}
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            if (!uri) return;
            const file = new File(uri);
            if (file.size > 75_000_029) throw new Error('BACKUP_SIZE_LIMIT');
            const decrypted = openArchive(await file.bytes(), key);
            await engine.restoreSnapshot(
              new TextDecoder('utf-8', { fatal: true }).decode(decrypted),
            );
            setKey('');
            router.replace('/');
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
