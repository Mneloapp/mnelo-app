import { theme } from '@/theme/tokens';
import { useState } from 'react';
import { Switch } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Row, Section } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import { useAction } from '@/hooks/useAction';
import type { Profile } from '@/types/domain';
export function ProfilePreferences({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState(profile.languages);
  const [available, setAvailable] = useState(profile.availableToday);
  const [saved, setSaved] = useState(false);
  const a = useAction();
  return (
    <Section title={t('profile.matchPreferences')}>
      <AppText>{t('profile.languages')}</AppText>
      {(['en', 'ka'] as const).map((code) => (
        <Row
          key={code}
          title={t(code === 'en' ? 'account.english' : 'account.georgian')}
          right={
            <Switch
              hitSlop={theme.spacing.lg}
              trackColor={{ false: theme.colors.controlBorder, true: theme.colors.accent }}
              accessibilityLabel={t(code === 'en' ? 'account.english' : 'account.georgian')}
              value={languages.includes(code)}
              onValueChange={(value) => {
                setSaved(false);
                setLanguages(value ? [...languages, code] : languages.filter((l) => l !== code));
              }}
            />
          }
        />
      ))}
      <Row
        title={t('profile.availableToday')}
        right={
          <Switch
            hitSlop={theme.spacing.lg}
            trackColor={{ false: theme.colors.controlBorder, true: theme.colors.accent }}
            accessibilityLabel={t('profile.availableToday')}
            value={available}
            onValueChange={(value) => {
              setSaved(false);
              setAvailable(value);
            }}
          />
        }
      />
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      {saved && <AppText accessibilityRole="alert">{t('profile.preferencesSaved')}</AppText>}
      <Button
        variant="secondary"
        label={t('profile.savePreferences')}
        busy={a.busy}
        disabled={!languages.length}
        onPress={() =>
          void a.run(
            async () => {
              await repository().updateProfilePreferences(languages, available);
              return repository().profile(profile.id);
            },
            (p) => {
              useSession.getState().setProfile(p);
              setSaved(true);
            },
          )
        }
      />
    </Section>
  );
}
