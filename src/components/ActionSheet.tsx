import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';
import { AppText } from './AppText';
export function ActionSheet({
  visible,
  title,
  onClose,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
}>) {
  const reduced = useReducedMotion();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      accessibilityLabel={title}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.modal} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('compose.close')}
            onPress={onClose}
          />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.sheet}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.handle} accessible={false} />
            <AppText variant="headline" accessibilityRole="header">
              {title}
            </AppText>
            {children}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.scrim },
  scroll: {
    flexGrow: 0,
    maxHeight: '90%',
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
  },
  sheet: { padding: theme.spacing.xl, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  handle: {
    width: theme.spacing.section,
    height: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: -theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
});
