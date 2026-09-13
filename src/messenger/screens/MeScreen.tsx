import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { IconButton, Page } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { profileName } from '../local-profile';
import { avatarUri } from '../profile-avatar';
import { isReviewPhone } from '../review-account';
import { ProfileGroup, ProfileHero, ProfileRow, profileStyles } from '../components/OwnProfile';

export function MeScreen() {
  const { profile, enrollment } = useDevice();
  const { t } = useTranslation();
  const openProfile = () => router.push('/edit-profile');
  return (
    <Page
      title={t('tabs.me')}
      bottomSafe={false}
      contentStyle={profileStyles.content}
      right={
        <View style={profileStyles.headerActions}>
          <IconButton
            icon="grid"
            label={t('card.qr')}
            onPress={() => router.push({ pathname: '/my-code', params: { from: 'me' } })}
          />
          <IconButton icon="edit-2" label={t('card.edit')} onPress={openProfile} />
        </View>
      }
    >
      {enrollment?.testOnly && isReviewPhone(enrollment.phone) ? (
        <AppText tone="secondary">{t('phone.reviewNotice')}</AppText>
      ) : null}
      <ProfileHero
        name={profileName(profile)}
        uri={avatarUri(profile.avatar)}
        username={profile.username}
        headline={profile.headline || profile.about}
        label={t('profile.title')}
        onPress={openProfile}
      />
      <ProfileGroup>
        <ProfileRow
          label={t('messenger.contacts')}
          icon="users"
          onPress={() => router.push({ pathname: '/new-message', params: { from: 'me' } })}
        />
        <ProfileRow
          label={t('messenger.notifications')}
          icon="bell"
          onPress={() => router.push('/notifications')}
        />
        <ProfileRow
          label={t('messenger.privacy')}
          icon="shield"
          onPress={() => router.push('/privacy')}
          last
        />
      </ProfileGroup>
      <ProfileGroup>
        <ProfileRow
          label={t('messenger.backups')}
          icon="download"
          onPress={() => router.push('/backups')}
        />
        <ProfileRow
          label={t('messenger.blocked')}
          icon="slash"
          onPress={() => router.push('/blocked')}
        />
        <ProfileRow
          label={t('messenger.settings')}
          icon="settings"
          onPress={() => router.push('/account')}
          last
        />
      </ProfileGroup>
    </Page>
  );
}
