import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { IconButton, Page } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';

export function RegistrationFooter({ canRestore }: { canRestore: boolean }) {
  const { t } = useTranslation();
  const [privacy, setPrivacy] = useState(false);
  const reduced = useReducedMotion();
  return (
    <>
      <View style={styles.footer}>
        <FocusPressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => setPrivacy(true)}
        >
          <AppText variant="caption" tone="secondary" centered>
            {t('messenger.privacy')}
          </AppText>
        </FocusPressable>
        {canRestore && (
          <FocusPressable
            accessibilityRole="button"
            style={styles.link}
            onPress={() => router.push('/restore')}
          >
            <AppText variant="caption" tone="secondary" centered>
              {t('messenger.restore')}
            </AppText>
          </FocusPressable>
        )}
      </View>
      <Modal
        visible={privacy}
        animationType={reduced ? 'none' : 'slide'}
        accessibilityViewIsModal
        onRequestClose={() => setPrivacy(false)}
      >
        <SafeAreaProvider onAccessibilityEscape={() => setPrivacy(false)}>
          <Page showDevelopmentNotice={false}>
            <View style={styles.heading}>
              <AppText variant="headline" accessibilityRole="header" style={styles.title}>
                {t('messenger.privacy')}
              </AppText>
              <IconButton icon="x" label={t('compose.close')} onPress={() => setPrivacy(false)} />
            </View>
            <AppText>{t('phone.discoveryDefault')}</AppText>
            <AppText tone="secondary">{t('phone.disclosure')}</AppText>
          </Page>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  title: { flex: 1 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: theme.spacing.xl,
  },
  link: {
    minHeight: theme.controls.minTapTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
});
