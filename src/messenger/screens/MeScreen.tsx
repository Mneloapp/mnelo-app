import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Page } from '@/components/ui';
import { FocusTabHeader } from '@/components/FocusTabHeader';
import { useDevice } from '../DeviceProvider';
import { profileName } from '../local-profile';
import { avatarUri } from '../profile-avatar';
import { isReviewPhone } from '../review-account';
import {
  ProfileAction,
  ProfileGroup,
  ProfileHero,
  ProfileRow,
  profileStyles,
} from '../components/OwnProfile';

export function MeScreen() {
  const { profile, enrollment } = useDevice();
  const { t } = useTranslation();
  const openProfile = () => router.push('/edit-profile');
  return (
    <Page bottomSafe={false} contentStyle={[profileStyles.content, profileStyles.tabContent]}>
      <FocusTabHeader
        title={t('focus.mySpace')}
        subtitle={t('focus.profileSettings')}
        actionLabel={t('card.edit')}
        actionIcon="edit-2"
        onAction={openProfile}
      />
      {enrollment?.testOnly && isReviewPhone(enrollment.phone) ? (
        <AppText tone="secondary">{t('phone.reviewNotice')}</AppText>
      ) : null}
      <ProfileHero
        name={profileName(profile)}
        uri={avatarUri(profile.avatar)}
        phone={enrollment?.phone}
        username={profile.username}
        headline={profile.headline || profile.about}
        label={t('profile.title')}
        onPress={openProfile}
      >
        <View style={profileStyles.heroActions}>
          <ProfileAction
            icon="grid"
            label={t('card.qr')}
            onPress={() => router.push({ pathname: '/my-code', params: { from: 'me' } })}
          />
          <ProfileAction icon="edit-2" label={t('card.edit')} onPress={openProfile} />
        </View>
      </ProfileHero>
      <ProfileGroup flat title={t('focus.myAccount')}>
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
      <ProfileGroup flat title={t('focus.storageManagement')}>
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
