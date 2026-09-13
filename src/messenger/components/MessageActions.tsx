import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';
import type { LocalMessage } from '../model';

export function MessageActions({
  message,
  close,
  reply,
  forward,
  copy,
  remove,
  react,
  retry,
  busy,
}: {
  message: LocalMessage;
  close: () => void;
  reply: () => void;
  forward: () => void;
  copy: () => void;
  remove: () => void;
  react: (emoji: string) => void;
  retry: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: 'corner-up-left', label: t('messenger.reply'), onPress: reply },
    ...(message.kind !== 'call'
      ? [{ icon: 'corner-up-right' as const, label: t('messenger.forward'), onPress: forward }]
      : []),
    ...(message.body ? [{ icon: 'copy' as const, label: t('messenger.copy'), onPress: copy }] : []),
    ...(message.status === 'pending'
      ? [{ icon: 'refresh-cw' as const, label: t('messenger.retry'), onPress: retry }]
      : []),
    { icon: 'trash-2', label: t('messenger.deleteLocal'), onPress: remove },
  ];
  return (
    <Modal transparent visible onRequestClose={close} animationType="none">
      <SafeAreaProvider>
        <SafeAreaView style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={close}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('compose.close')}
            onPress={close}
          />
          <ScrollView style={styles.menu} contentContainerStyle={styles.content} bounces={false}>
            {message.body ? <AppText numberOfLines={2}>{message.body}</AppText> : null}
            <View style={styles.reactions}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <FocusPressable
                  key={emoji}
                  style={styles.reaction}
                  accessibilityRole="button"
                  accessibilityLabel={t('messenger.reactWith', { emoji })}
                  disabled={busy}
                  onPress={() => react(emoji)}
                >
                  <AppText variant="headline">{emoji}</AppText>
                </FocusPressable>
              ))}
            </View>
            {actions.map((item) => (
              <FocusPressable
                key={item.icon}
                style={styles.action}
                accessibilityRole="button"
                onPress={item.onPress}
                accessibilityLabel={item.label}
                disabled={busy}
              >
                <AppIcon
                  name={item.icon}
                  color={item.icon === 'trash-2' ? theme.colors.error : theme.colors.black}
                />
                <AppText variant="bodyMedium" style={styles.label}>
                  {item.label}
                </AppText>
              </FocusPressable>
            ))}
            <AppText variant="caption" tone="secondary">
              {new Date(message.sentAt).toLocaleString()}
            </AppText>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  label: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.scrim,
  },
  menu: {
    flexGrow: 0,
    width: '100%',
    maxWidth: theme.layout.photoPreviewHeight,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
  },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderBottomWidth: theme.controls.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  reaction: {
    minWidth: theme.controls.minTapTarget,
    minHeight: theme.controls.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
    minHeight: theme.controls.minTapTarget,
  },
});
