import { matchesConfirmation } from '@/i18n/format';
import { useDeletionState } from '@/features/privacy/deletion-state';
import { profileInputSchema } from './validation';
import { ProfilePreferences } from './ProfilePreferences';
import { AvatarEditor } from './AvatarEditor';
import { ProfileAvatar } from './ProfileAvatar';
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import {
  Avatar,
  Button,
  Choice,
  Field,
  Page,
  Row,
  Section,
  SettingsRow,
  StateView,
  ui,
} from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { useNeeds } from '@/hooks/useRepository';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import { usePreferences } from '@/stores/preferences';
export function MeScreen() {
  const { t } = useTranslation();
  const profile = useSession((s) => s.session?.profile);
  return (
    <Page bottomSafe={false} title={t('tabs.me')}>
      {profile && (
        <Row
          title={profile.displayName}
          subtitle={'@' + profile.username}
          left={<ProfileAvatar profile={profile} size="large" />}
          onPress={() => router.push('/edit-profile')}
        />
      )}
      <Button
        variant="secondary"
        label={t('profile.edit')}
        onPress={() => router.push('/edit-profile')}
      />
      <Section title={t('me.myMnelo')}>
        <SettingsRow
          title={t('me.connections')}
          icon="users"
          onPress={() => router.push('/connections')}
        />
        <SettingsRow
          title={t('me.requests')}
          icon="user-plus"
          onPress={() => router.push('/requests')}
        />
        <SettingsRow title={t('me.needs')} icon="file-text" onPress={() => router.push('/needs')} />
      </Section>
      <Section title={t('me.settings')}>
        <SettingsRow
          title={t('me.privacy')}
          icon="shield"
          onPress={() => router.push('/privacy')}
        />
        <SettingsRow
          title={t('me.notifications')}
          icon="bell"
          onPress={() => router.push('/notifications')}
        />
        <SettingsRow
          title={t('me.devices')}
          icon="smartphone"
          onPress={() => router.push('/devices')}
        />
        <SettingsRow
          title={t('me.account')}
          icon="settings"
          onPress={() => router.push('/account')}
        />
      </Section>
    </Page>
  );
}
export function EditProfileScreen() {
  const { t } = useTranslation();
  const profile = useSession((s) => s.session?.profile);
  const [name, setName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [area, setArea] = useState(profile?.area ?? '');
  const [capability, setCapability] = useState(profile?.capabilities.join(', ') ?? '');
  const a = useAction();
  const cache = useQueryClient();
  return (
    <Page title={t('profile.edit')} back>
      <View style={ui.center}>
        {profile ? (
          <ProfileAvatar profile={profile} size="large" />
        ) : (
          <Avatar name={name} size="large" />
        )}
      </View>
      <AvatarEditor />
      <Field label={t('profile.displayName')} value={name} onChangeText={setName} maxLength={60} />
      <Field
        label={t('profile.username')}
        value={username}
        onChangeText={(s) => setUsername(s.toLowerCase().replace(/^@/, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
      />
      <Field label={t('profile.bio')} value={bio} onChangeText={setBio} multiline maxLength={500} />
      <Field
        label={t('profile.area')}
        value={area}
        onChangeText={setArea}
        maxLength={100}
        hint={t('profile.areaHint')}
        error={
          !profileInputSchema.shape.area.safeParse(area).success
            ? t('privacy.coarseAreaError')
            : undefined
        }
      />
      <Field
        label={t('profile.capabilities')}
        value={capability}
        onChangeText={setCapability}
        multiline
        maxLength={500}
      />
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      <Button
        label={t('common.save')}
        busy={a.busy}
        disabled={
          !name.trim() ||
          !/^[a-z][a-z0-9_]{2,23}$/.test(username) ||
          !profileInputSchema.shape.area.safeParse(area).success
        }
        onPress={() =>
          void a.run(
            () =>
              repository().saveProfile({
                displayName: name,
                username,
                bio,
                area,
                capabilities: capability
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              }),
            (p) => {
              useSession.getState().setProfile(p);
              void cache.invalidateQueries({ queryKey: ['profile'] });
              router.back();
            },
          )
        }
      />
      {profile && <ProfilePreferences profile={profile} />}
    </Page>
  );
}
export { ConnectionsScreen, RequestsScreen } from '@/features/connections/screens';
export function NeedsScreen() {
  const { t } = useTranslation();
  const q = useNeeds();
  const a = useAction();
  return (
    <Page title={t('me.needs')} back>
      <Button label={t('connect.create')} onPress={() => router.push('/(tabs)/connect')} />
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : q.data?.length ? (
        q.data.map((n) => (
          <Section key={n.id} title={t(n.mode === 'need' ? 'connect.need' : 'connect.offer')}>
            <AppText>{n.rawText}</AppText>
            <AppText tone="secondary">{t(`connect.status.${n.status}`)}</AppText>
            <Button
              variant="secondary"
              label={t(n.status === 'active' ? 'connect.pause' : 'connect.activate')}
              onPress={() =>
                void a.run(
                  () =>
                    repository().setNeedStatus(n.id, n.status === 'active' ? 'paused' : 'active'),
                  () => {
                    void q.refetch();
                  },
                )
              }
            />
            <Button
              variant="secondary"
              label={t('connect.viewResults')}
              onPress={() => router.push({ pathname: '/results/[id]', params: { id: n.id } })}
            />
            {n.status !== 'closed' && (
              <Button
                variant="secondary"
                label={t('connect.close')}
                busy={a.busy}
                onPress={() =>
                  void a.run(
                    () => repository().setNeedStatus(n.id, 'closed'),
                    () => {
                      void q.refetch();
                    },
                  )
                }
              />
            )}
          </Section>
        ))
      ) : (
        <StateView message={t('connect.noNeeds')} />
      )}
      {q.hasNextPage && (
        <Button
          variant="secondary"
          label={t('common.loadMore')}
          busy={q.isFetchingNextPage}
          onPress={() => void q.fetchNextPage()}
        />
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Page>
  );
}
export { PrivacyScreen } from '@/features/privacy/PrivacyScreen';
export { DevicesScreen } from '@/features/privacy/DevicesScreen';
export function AccountScreen() {
  const { t } = useTranslation();
  const a = useAction();
  const cache = useQueryClient();
  const locale = usePreferences((s) => s.locale);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  function clear() {
    useSession.getState().setSession(null);
    cache.clear();
    router.replace('/');
  }
  return (
    <Page title={t('me.account')} back>
      <Section title={t('account.language')}>
        <Choice
          value={locale}
          onChange={(locale) => void a.run(() => usePreferences.getState().setLocale(locale))}
          options={[
            { value: 'en', label: t('account.english') },
            { value: 'ka', label: t('account.georgian') },
          ]}
        />
      </Section>
      <Button
        variant="secondary"
        label={t('account.logout')}
        busy={a.busy}
        onPress={() => void a.run(() => repository().logout(), clear)}
      />
      {deleting ? (
        <Section title={t('account.delete')}>
          <AppText>{t('account.deleteExplanation')}</AppText>
          <Field
            label={t('account.confirmDelete')}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize={locale === 'en' ? 'characters' : 'none'}
            editable={!a.busy}
          />
          <Button
            variant="danger"
            label={t('account.requestDeletion')}
            busy={a.busy}
            disabled={!matchesConfirmation(confirmation, t('account.confirmWord'))}
            onPress={() =>
              void a.run(async () => {
                try {
                  await repository().requestAccountDeletion();
                } finally {
                  if (await repository().pendingAccountDeletion())
                    useDeletionState.getState().setPending(true);
                }
              })
            }
          />
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setDeleting(false)}
            disabled={a.busy}
          />
        </Section>
      ) : (
        <Button variant="danger" label={t('account.delete')} onPress={() => setDeleting(true)} />
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Page>
  );
}
export { ReportScreen } from '@/features/moderation/ReportScreen';
