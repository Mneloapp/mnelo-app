import { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  const [entrance] = useState(() => new Animated.Value(0));
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
          <Animated.View
            style={[
              styles.panel,
              {
                transform: [
                  {
                    translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
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
              <View style={styles.handle} accessible={false} />
              <AppText variant="headline" accessibilityRole="header">
                {title}
              </AppText>
              {children}
            </ScrollView>
          </Animated.View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: theme.colors.scrim },
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
