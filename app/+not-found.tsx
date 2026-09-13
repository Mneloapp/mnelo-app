import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="title" centered accessibilityRole="header">
        {t('error.notFound')}
      </AppText>
      <AppButton label={t('error.home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
