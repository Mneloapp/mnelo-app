import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';
import { AppText } from './AppText';
import { AppIcon } from './AppIcon';
import { FocusPressable } from './FocusPressable';
export function ActionSheet({
  visible,
  title,
  onClose,
  onDismiss,
  compact = false,
  avoidKeyboard = false,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  compact?: boolean;
  avoidKeyboard?: boolean;
}>) {
  const reduced = useReducedMotion();
  const { t } = useTranslation();
  const [entrance] = useState(() => new Animated.Value(0));
  const wasVisible = useRef(visible);
  useEffect(() => {
    // iOS must finish removing its presented controller before another native picker opens.
    // Android/web remove this non-animated modal with the visibility commit.
    if (wasVisible.current && !visible && Platform.OS !== 'ios') onDismiss?.();
    wasVisible.current = visible;
  }, [visible, onDismiss]);
  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      return;
    }
    if (reduced) {
      entrance.setValue(1);
      return;
    }
    const motion = Animated.timing(entrance, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => motion.stop();
  }, [entrance, reduced, visible]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      accessibilityLabel={title}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.modal} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.scrim, { opacity: entrance }]}
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('compose.close')}
            onPress={onClose}
          />
          <KeyboardAvoidingView
            enabled={avoidKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboard}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.panel,
                {
                  transform: [
                    {
                      translateY: entrance.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.sheet}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {compact ? (
                  <View style={styles.header}>
                    <View style={styles.closeSpace} />
                    <AppText variant="bodyMedium" accessibilityRole="header" style={styles.title}>
                      {title}
                    </AppText>
                    <FocusPressable
                      accessibilityRole="button"
                      accessibilityLabel={t('common.cancel')}
                      onPress={onClose}
                      style={styles.close}
                    >
                      <AppIcon name="x" />
                    </FocusPressable>
                  </View>
                ) : (
                  <>
                    <View style={styles.handle} accessible={false} />
                    <AppText variant="headline" accessibilityRole="header">
                      {title}
                    </AppText>
                  </>
                )}
                {children}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { flex: 1, textAlign: 'center' },
  closeSpace: { width: theme.controls.minTapTarget },
  close: {
    width: theme.controls.minTapTarget,
    height: theme.controls.minTapTarget,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: theme.colors.scrim },
  keyboard: { flex: 1, justifyContent: 'flex-end' },
  panel: { maxHeight: '90%', flexShrink: 1 },
  scroll: {
    flexGrow: 0,
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
