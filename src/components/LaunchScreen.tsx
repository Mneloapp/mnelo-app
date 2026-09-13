import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from './Screen';
import { AppText } from './AppText';
import { theme } from '@/theme/tokens';
import { MneloLogo } from './MneloBrand';

// Shared neutral launch surface while application state is being restored.
export function LaunchScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <View style={styles.wordmark}>
        <MneloLogo size="welcome" />
        <AppText tone="secondary" centered>
          {t('tagline')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ wordmark: { gap: theme.spacing.md, alignItems: 'center' } });
