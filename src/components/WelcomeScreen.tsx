import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MneloMark } from './MneloBrand';
import { theme } from '@/theme/tokens';

// The same approved artwork covers font and device-vault loading. No font dependency,
// account creation, network request, motion or extra onboarding action is required.
export function WelcomeScreen() {
  const { t } = useTranslation();
  return (
    <View
      style={styles.screen}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('brand') + '. ' + t('common.loading')}
    >
      <MneloMark size={theme.brand.launchMark} />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
