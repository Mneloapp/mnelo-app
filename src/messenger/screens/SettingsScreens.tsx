import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field, Page, StateView } from '@/components/ui';
import { PhonePrivacySection } from './PhonePrivacySection';
import { usePhoneService } from './phone-shared';
import { AppText } from '@/components/AppText';
import { usePreferences } from '@/stores/preferences';
import { useDevice } from '../DeviceProvider';
import { clearSystemCallAccount } from '../system-calls';
import { cleanupChatExports } from '../chat-export-cache';
import { bytesToHex, openArchive, sealArchive } from '../crypto';
import { Check, useLocalAction } from './shared';
import { discardCachedMedia } from '@/features/chats/media-files';
import { deliveryV2 } from '../delivery-mode';
import {
  SettingsAction,
  SettingsCard,
  SettingsChoice,
  settingsStyles,
} from '../components/SettingsUI';
import { ProfileGroup, ProfileRow } from '../components/OwnProfile';
export { EditProfileScreen } from './LocalProfileScreen';

export { MeScreen } from './MeScreen';

export function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <Page contentStyle={settingsStyles.page} title={t('messenger.privacy')} back>
      <PhonePrivacySection />
      <SettingsCard title={t('messenger.privacyMessages')} icon="lock">
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.privacyHint')}
        </AppText>
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.offlineHint')}
        </AppText>
      </SettingsCard>
      <SettingsCard title={t('messenger.settingsStorage')} icon="smartphone">
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.backupResponsibility')}
        </AppText>
      </SettingsCard>
      <SettingsAction
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
    <Page contentStyle={settingsStyles.page} title={t('messenger.blocked')} back>
      {blocked?.map((contact) => (
        <SettingsCard key={contact.key} title={contact.name} icon="user">
          <SettingsAction
            variant="secondary"
            label={t('messenger.unblock')}
            busy={action.busy}
            onPress={() => void action.run(() => engine.block(contact.key, false))}
          />
        </SettingsCard>
      ))}
      {blocked?.length === 0 && (
        <SettingsCard title={t('messenger.blocked')} icon="slash">
          <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
            {t('messenger.noBlocked')}
          </AppText>
        </SettingsCard>
      )}
      {(q.isPending || q.isError) && (
        <StateView
          loading={q.isPending}
          error={q.isError ? t('messenger.genericError') : undefined}
        />
      )}
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
    <Page contentStyle={settingsStyles.page} title={t('messenger.settings')} back>
      <ProfileGroup>
        <ProfileRow
          label={t('messenger.openSource')}
          icon="code"
          onPress={() => router.push('/open-source')}
          last
        />
      </ProfileGroup>
      <SettingsCard title={t('account.language')} icon="globe">
        <View accessibilityRole="radiogroup" accessibilityLabel={t('account.language')}>
          {(['en', 'ka'] as const).map((value) => (
            <SettingsChoice
              key={value}
              label={t(value === 'en' ? 'account.english' : 'account.georgian')}
              selected={locale === value}
              disabled={action.busy}
              onPress={() => void action.run(() => usePreferences.getState().setLocale(value))}
            />
          ))}
        </View>
      </SettingsCard>
      <SettingsCard title={t('messenger.eraseDevice')} icon="trash-2">
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.eraseHint')}
        </AppText>
        <Check
          value={unlinkNumber}
          label={t('messenger.eraseNumberToo')}
          onChange={setUnlinkNumber}
        />
        <Check value={confirmed} label={t('messenger.eraseConfirmed')} onChange={setConfirmed} />
        <SettingsAction
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
              cleanupChatExports();
              await clearSystemCallAccount().catch(() => undefined);
              router.replace('/');
            })
          }
        />
      </SettingsCard>
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
    <Page contentStyle={settingsStyles.page} title={t('messenger.backups')} back>
      <SettingsCard title={t('messenger.backupOff')} icon="download">
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.backupHint')}
        </AppText>
        <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
          {t('messenger.backupResponsibility')}
        </AppText>
        {deliveryV2 && (
          <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
            {t('messenger.backupRecoveryPending')}
          </AppText>
        )}
      </SettingsCard>
      <SettingsAction
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
        <SettingsCard title={t('messenger.recoveryKey')} icon="key">
          <AppText selectable variant="caption" style={settingsStyles.note}>
            {key}
          </AppText>
          <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
            {t('messenger.recoveryHint')}
          </AppText>
          <SettingsAction
            variant="secondary"
            label={t('messenger.copy')}
            onPress={() =>
              void action.run(async () => {
                await Clipboard.setStringAsync(key);
              })
            }
          />
          <Check value={saved} label={t('messenger.keySaved')} onChange={setSaved} />
          <SettingsAction
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
        </SettingsCard>
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
      <Page contentStyle={settingsStyles.page} title={t('messenger.restore')} back>
        <SettingsCard title={t('messenger.restore')} icon="download">
          <AppText
            accessibilityRole="alert"
            variant="caption"
            tone="secondary"
            style={settingsStyles.note}
          >
            {t('messenger.backupRecoveryPending')}
          </AppText>
        </SettingsCard>
      </Page>
    );
  return (
    <Page contentStyle={settingsStyles.page} title={t('messenger.restore')} back>
      <AppText variant="caption" tone="secondary" style={settingsStyles.note}>
        {t('messenger.restoreHint')}
      </AppText>
      <SettingsAction
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
        style={settingsStyles.field}
        label={t('messenger.recoveryKey')}
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        maxLength={64}
      />
      <SettingsAction
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
