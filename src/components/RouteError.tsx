import type { ErrorBoundaryProps } from 'expo-router';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { i18n } from '@/i18n';

export function RouteError({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <AppText variant="title" centered accessibilityRole="header">
        {i18n.t('error.title')}
      </AppText>
      <AppText tone="secondary" centered>
        {i18n.t('error.description')}
      </AppText>
      <AppButton
        label={i18n.t('error.retry')}
        onPress={() => {
          void retry();
        }}
      />
    </Screen>
  );
}
