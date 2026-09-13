import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Avatar, Page } from '@/components/ui';
import { FocusPressable } from '@/components/FocusPressable';
import { ActionSheet } from '@/components/ActionSheet';
import { SheetAction } from '@/components/SheetAction';
import { useDevice } from '../DeviceProvider';
import { localProfile, profileName } from '../local-profile';
import { useLocalAction } from './shared';
import { pickProfilePhoto } from '../pick-profile-photo';
import { avatarUri } from '../profile-avatar';
import { ProfileGroup, ProfileRow, profileStyles } from '../components/OwnProfile';
import type { ProfileField } from '../profile-fields';

export function EditProfileScreen() {
  const { engine, profile, enrollment } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [photoMenu, setPhotoMenu] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const pickAfterDismiss = useRef(false);
  function photoMenuDismissed() {
    if (!pickAfterDismiss.current) return;
    pickAfterDismiss.current = false;
    void action.run(async () => {
      setPhotoError(false);
      let avatar: string | null;
      try {
        avatar = await pickProfilePhoto();
      } catch {
        setPhotoError(true);
        return;
      }
      if (avatar)
        await engine.saveProfile({ ...localProfile.parse(engine.currentProfile()), avatar });
    });
  }
  const edit = (field: ProfileField) =>
    router.push({ pathname: '/edit-profile-field', params: { field } });
  return (
    <Page title={t('profile.title')} back contentStyle={profileStyles.content}>
      <View style={profileStyles.photo}>
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={t('card.changePhoto')}
          disabled={action.busy}
          onPress={() => setPhotoMenu(true)}
        >
          <View style={profileStyles.avatarRing}>
            <Avatar name={profileName(profile)} uri={avatarUri(profile.avatar)} size="profile" />
          </View>
        </FocusPressable>
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={t('card.editPhoto')}
          disabled={action.busy}
          accessibilityState={{ busy: action.busy, disabled: action.busy }}
          onPress={() => setPhotoMenu(true)}
          style={({ pressed }) => [profileStyles.photoAction, pressed && profileStyles.pressed]}
        >
          <AppText variant="bodyMedium" style={profileStyles.photoActionText}>
            {t('card.editPhoto')}
          </AppText>
        </FocusPressable>
      </View>
      <ProfileGroup>
        <ProfileRow
          label={t('card.name')}
          value={profileName(profile)}
          onPress={() => edit('name')}
        />
        <ProfileRow
          label={t('card.about')}
          value={profile.headline || profile.about || t('card.addAbout')}
          onPress={() => edit('about')}
        />
        <ProfileRow
          label={t('messenger.username')}
          value={profile.username ? `@${profile.username}` : t('card.addUsername')}
          onPress={() => edit('username')}
        />
        <ProfileRow
          label={t('auth.phone')}
          value={enrollment?.phone || t('phone.changeNumber')}
          onPress={() => router.push('/phone')}
        />
        <ProfileRow
          label={t('card.links')}
          value={profile.website || profile.email || t('card.addLinks')}
          onPress={() => edit('links')}
          last
        />
      </ProfileGroup>
      {photoError ? <AppText accessibilityRole="alert">{t('card.photoError')}</AppText> : null}
      {action.error ? <AppText accessibilityRole="alert">{action.error}</AppText> : null}
      <ActionSheet
        visible={photoMenu}
        title={t('card.photo')}
        onClose={() => setPhotoMenu(false)}
        onDismiss={photoMenuDismissed}
      >
        <SheetAction
          icon="image"
          label={t(profile.avatar ? 'card.changePhoto' : 'card.addPhoto')}
          disabled={action.busy}
          onPress={() => {
            pickAfterDismiss.current = true;
            setPhotoMenu(false);
          }}
        />
        {profile.avatar ? (
          <SheetAction
            icon="trash-2"
            label={t('card.removePhoto')}
            danger
            disabled={action.busy}
            onPress={() => {
              setPhotoMenu(false);
              void action.run(async () => {
                await engine.saveProfile({
                  ...localProfile.parse(engine.currentProfile()),
                  avatar: '',
                });
              });
            }}
          />
        ) : null}
        <SheetAction icon="x" label={t('common.cancel')} onPress={() => setPhotoMenu(false)} />
      </ActionSheet>
    </Page>
  );
}
