import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { Avatar, Field, Row, ui } from '@/components/ui';
import { profileStyles, ProfileGroup } from './OwnProfile';
import { infoStyles } from './ContactInfo';
import { pickProfilePhoto } from '../pick-profile-photo';
import { avatarUri } from '../profile-avatar';
import { type GroupProfile } from '../group-profile';
import { useLocalAction } from '../screens/shared';

export function GroupProfileFields({
  name,
  onNameChange,
  profile,
  onChange,
  busy = false,
  onPhotoBusyChange,
}: {
  name: string;
  onNameChange: (value: string) => void;
  profile: GroupProfile;
  onChange: (value: GroupProfile) => void;
  busy?: boolean;
  onPhotoBusyChange?: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const photo = useLocalAction();
  const [more, setMore] = useState(Boolean(profile.headline || profile.email || profile.website));
  const update = (patch: Partial<GroupProfile>) => onChange({ ...profile, ...patch });
  const props = { style: infoStyles.field, editable: !busy && !photo.busy };
  return (
    <>
      <View style={profileStyles.photo}>
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={t(profile.avatar ? 'card.changePhoto' : 'card.addPhoto')}
          disabled={busy || photo.busy}
          onPress={() => {
            onPhotoBusyChange?.(true);
            void photo
              .run(async () => {
                const avatar = await pickProfilePhoto();
                if (avatar) update({ avatar });
              })
              .finally(() => onPhotoBusyChange?.(false));
          }}
          style={profileStyles.avatarRing}
        >
          <Avatar
            group
            name={name || t('messenger.newGroup')}
            uri={avatarUri(profile.avatar)}
            size="profile"
          />
          <View style={{ alignSelf: 'center' }}>
            <AppIcon name="camera" />
          </View>
        </FocusPressable>
        <AppText variant="caption" tone="secondary">
          {t(profile.avatar ? 'card.changePhoto' : 'card.addPhoto')}
        </AppText>
        {profile.avatar ? (
          <FocusPressable
            accessibilityRole="button"
            disabled={busy || photo.busy}
            onPress={() => update({ avatar: '' })}
            style={profileStyles.photoAction}
          >
            <AppText style={profileStyles.photoActionText}>{t('card.removePhoto')}</AppText>
          </FocusPressable>
        ) : null}
      </View>
      <ProfileGroup>
        <View style={{ ...ui.stack, paddingVertical: theme.spacing.lg }}>
          <Field
            {...props}
            label={t('messenger.groupName')}
            value={name}
            onChangeText={onNameChange}
            maxLength={80}
          />
          <Field
            {...props}
            label={t('messenger.groupDescription')}
            value={profile.about}
            multiline
            maxLength={240}
            onChangeText={(about) => update({ about })}
          />
        </View>
      </ProfileGroup>
      <ProfileGroup>
        <Row
          title={t('messenger.groupAdditionalInfo')}
          onPress={() => setMore(!more)}
          right={<AppIcon name={more ? 'chevron-up' : 'chevron-down'} />}
        />
        {more ? (
          <View style={{ ...ui.stack, paddingBottom: theme.spacing.lg }}>
            <Field
              {...props}
              label={t('card.shortAbout')}
              value={profile.headline}
              maxLength={80}
              onChangeText={(headline) => update({ headline })}
            />
            <Field
              {...props}
              label={t('card.website')}
              value={profile.website}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={240}
              onChangeText={(website) => update({ website })}
            />
            <Field
              {...props}
              label={t('card.email')}
              value={profile.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={254}
              onChangeText={(email) => update({ email })}
            />
          </View>
        ) : null}
      </ProfileGroup>
      {photo.error ? <AppText accessibilityRole="alert">{t('card.photoError')}</AppText> : null}
    </>
  );
}
