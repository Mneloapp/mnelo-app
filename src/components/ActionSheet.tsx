import type { PropsWithChildren } from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : 'slide'}
      accessibilityLabel={title}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modal} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.sheet}
          keyboardShouldPersistTaps="handled"
        >
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.scrim },
  scroll: {
    flexGrow: 0,
    maxHeight: '100%',
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
  },
  sheet: { padding: theme.spacing.xl, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },
});
