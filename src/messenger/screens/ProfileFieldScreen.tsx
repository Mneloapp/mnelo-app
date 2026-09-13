import { useState } from 'react';
import { Keyboard } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Field, IconButton, Page } from '@/components/ui';
import { infoStyles } from '../components/ContactInfo';
import { useDevice } from '../DeviceProvider';
import { localProfile } from '../local-profile';
import {
  isProfileField,
  profileFieldDraft,
  type ProfileDraft,
  type ProfileField,
} from '../profile-fields';
import { useLocalAction } from './shared';

const titles = {
  name: 'card.name',
  about: 'card.about',
  username: 'messenger.username',
  links: 'card.links',
} as const;
export function ProfileFieldScreen() {
  const { field } = useLocalSearchParams<{ field?: string | string[] }>();
  return isProfileField(field) ? (
    <ProfileFieldEditor key={field} field={field} />
  ) : (
    <Redirect href="/edit-profile" />
  );
}
export function ProfileFieldEditor({ field }: { field: ProfileField }) {
  const { engine, profile } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [draft, setDraft] = useState(() => profileFieldDraft(localProfile.parse(profile), field));
  const valid = localProfile.safeParse({ ...profile, ...draft }).success;
  const dirty = Object.entries(draft).some(
    ([key, value]) => profile[key as keyof ProfileDraft] !== value,
  );
  const update = (patch: ProfileDraft) => setDraft((value) => ({ ...value, ...patch }));
  const props = { style: infoStyles.field, editable: !action.busy };
  return (
    <Page
      title={t(titles[field])}
      back
      nativeKeyboardInsets
      right={
        <IconButton
          icon="check"
          variant="accent"
          label={t('common.save')}
          disabled={!valid || !dirty}
          busy={action.busy}
          onPress={() =>
            void action.run(async () => {
              // Merge only the edited fields into the latest profile. An intervening photo
              // change must not be overwritten by a form opened earlier.
              await engine.saveProfile(
                localProfile.parse({ ...engine.currentProfile(), ...draft }),
              );
              Keyboard.dismiss();
              router.back();
            })
          }
        />
      }
    >
      {field === 'name' ? (
        <>
          <Field
            {...props}
            autoFocus
            label={t('messenger.firstName')}
            value={draft.firstName}
            maxLength={60}
            textContentType="givenName"
            autoComplete="given-name"
            onChangeText={(firstName) => update({ firstName })}
          />
          <Field
            {...props}
            label={t('messenger.lastName')}
            value={draft.lastName}
            maxLength={60}
            textContentType="familyName"
            autoComplete="family-name"
            onChangeText={(lastName) => update({ lastName })}
          />
        </>
      ) : null}
      {field === 'username' ? (
        <Field
          {...props}
          autoFocus
          label={t('messenger.username')}
          value={draft.username}
          hint={t('messenger.usernameHint')}
          placeholder={t('messenger.usernamePlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={32}
          onChangeText={(username) =>
            update({ username: username.replace(/^@/, '').toLowerCase() })
          }
        />
      ) : null}
      {field === 'about' ? (
        <>
          <Field
            {...props}
            autoFocus
            label={t('card.shortAbout')}
            placeholder={t('card.shortAboutPlaceholder')}
            value={draft.headline}
            maxLength={80}
            onChangeText={(headline) => update({ headline })}
          />
          <Field
            {...props}
            label={t('card.about')}
            placeholder={t('card.aboutPlaceholder')}
            value={draft.about}
            multiline
            maxLength={240}
            onChangeText={(about) => update({ about })}
          />
        </>
      ) : null}
      {field === 'links' ? (
        <>
          <Field
            {...props}
            autoFocus
            label={t('card.website')}
            value={draft.website}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={240}
            onChangeText={(website) => update({ website })}
          />
          <Field
            {...props}
            label={t('card.email')}
            value={draft.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
            onChangeText={(email) => update({ email })}
          />
        </>
      ) : null}
      <AppText variant="caption" tone="secondary">
        {t('card.detailsHint')}
      </AppText>
      {!valid ? <AppText accessibilityRole="alert">{t('card.invalidDetails')}</AppText> : null}
      {action.error ? <AppText accessibilityRole="alert">{action.error}</AppText> : null}
    </Page>
  );
}
