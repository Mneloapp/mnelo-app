import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Avatar, Button, Field, Page, Section, ui } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { localProfile, profileName } from '../local-profile';
import { useLocalAction } from './shared';
import { pickProfilePhoto } from '../pick-profile-photo';
import { avatarUri } from '../profile-avatar';

export function EditProfileScreen() {
  const { engine, profile } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [draft, setDraft] = useState(() => localProfile.parse(profile));
  const [photoError, setPhotoError] = useState(false);
  const valid = localProfile.safeParse(draft).success;
  return (
    <Page title={t('profile.edit')} back nativeKeyboardInsets>
      <View style={[ui.center, ui.stack]}>
        <Avatar name={profileName(draft)} uri={avatarUri(draft.avatar)} size="large" />
        <Button
          variant="secondary"
          label={t(draft.avatar ? 'card.changePhoto' : 'card.addPhoto')}
          busy={action.busy}
          onPress={() =>
            void action.run(async () => {
              setPhotoError(false);
              try {
                const photo = await pickProfilePhoto();
                if (photo) setDraft((value) => ({ ...value, avatar: photo }));
              } catch {
                setPhotoError(true);
              }
            })
          }
        />
        {draft.avatar ? (
          <Button
            variant="danger"
            label={t('card.removePhoto')}
            disabled={action.busy}
            onPress={() => setDraft((value) => ({ ...value, avatar: '' }))}
          />
        ) : null}
        {photoError && <AppText accessibilityRole="alert">{t('card.photoError')}</AppText>}
      </View>
      <Field
        label={t('messenger.username')}
        value={draft.username}
        hint={t('messenger.usernameHint')}
        placeholder={t('messenger.usernamePlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={32}
        editable={!action.busy}
        onChangeText={(username) =>
          setDraft((current) => ({
            ...current,
            username: username.replace(/^@/, '').toLowerCase(),
          }))
        }
      />
      <Field
        label={t('messenger.firstName')}
        value={draft.firstName}
        maxLength={60}
        textContentType="givenName"
        autoComplete="given-name"
        editable={!action.busy}
        onChangeText={(firstName) => setDraft((current) => ({ ...current, firstName }))}
      />
      <Field
        label={t('messenger.lastName')}
        value={draft.lastName}
        maxLength={60}
        textContentType="familyName"
        autoComplete="family-name"
        editable={!action.busy}
        onChangeText={(lastName) => setDraft((current) => ({ ...current, lastName }))}
      />
      <Section title={t('card.optional')}>
        <Field
          label={t('card.headline')}
          placeholder={t('card.headlinePlaceholder')}
          value={draft.headline}
          maxLength={80}
          editable={!action.busy}
          onChangeText={(headline) => setDraft((value) => ({ ...value, headline }))}
        />
        <Field
          label={t('card.about')}
          placeholder={t('card.aboutPlaceholder')}
          value={draft.about}
          multiline
          maxLength={240}
          editable={!action.busy}
          onChangeText={(about) => setDraft((value) => ({ ...value, about }))}
        />
        <Field
          label={t('card.email')}
          value={draft.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={254}
          editable={!action.busy}
          onChangeText={(email) => setDraft((value) => ({ ...value, email }))}
        />
        <Field
          label={t('card.website')}
          value={draft.website}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={240}
          editable={!action.busy}
          onChangeText={(website) => setDraft((value) => ({ ...value, website }))}
        />
      </Section>
      <AppText variant="caption" tone="secondary">
        {t('card.detailsHint')}
      </AppText>
      {!valid && <AppText>{t('card.invalidDetails')}</AppText>}
      <Button
        label={t('common.save')}
        disabled={!valid}
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            await engine.saveProfile(draft);
            router.back();
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
