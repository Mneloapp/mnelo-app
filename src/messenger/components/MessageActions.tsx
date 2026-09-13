import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatDate, formatTime } from '@/i18n/format';
import { AppText } from '@/components/AppText';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { Button, Field, IconButton, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import type { LocalMessage } from '../model';
import { callOutcomeCopy, readCallRecord } from '../call-record';
import { isReactionEmoji, moreReactions, quickReactions } from '../reaction-emoji';
import { MessageBubble } from './MessageBubble';
export type MessageAnchor = { x: number; y: number; width: number; height: number };

export function MessageActions({
  message,
  own = false,
  anchor,
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
  own?: boolean;
  anchor?: MessageAnchor | undefined;
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
  const { height, fontScale } = useWindowDimensions();
  const [forwardPending, setForwardPending] = useState(false);
  useEffect(() => {
    if (forwardPending && Platform.OS !== 'ios') forward();
  }, [forwardPending, forward]);
  const [contentHeight, setContentHeight] = useState(500);
  const [picker, setPicker] = useState(false),
    [emoji, setEmoji] = useState(''),
    [info, setInfo] = useState(false);
  const call = message.kind === 'call' ? readCallRecord(message.body) : null;
  const preview = call
    ? `${t(call.media === 'video' ? 'messenger.callVideo' : 'messenger.callVoice')} · ${t(callOutcomeCopy[call.status])}`
    : message.body || t(message.kind === 'image' ? 'messenger.openPhoto' : 'common.more');
  const actions: { icon: IconName; label: string; onPress: () => void }[] = [
    ...(!call
      ? [
          { icon: 'corner-up-left' as const, label: t('messenger.reply'), onPress: reply },
          {
            icon: 'corner-up-right' as const,
            label: t('messenger.forward'),
            onPress: () => setForwardPending(true),
          },
        ]
      : []),
    ...(!call && message.body
      ? [{ icon: 'copy' as const, label: t('messenger.copy'), onPress: copy }]
      : []),
    { icon: 'info', label: t('messenger.messageInfo'), onPress: () => setInfo((value) => !value) },
    ...(!call && message.status === 'pending'
      ? [{ icon: 'refresh-cw' as const, label: t('messenger.retry'), onPress: retry }]
      : []),
    { icon: 'trash-2', label: t('messenger.deleteLocal'), onPress: remove },
  ];
  const top = Math.max(
    12,
    Math.min((anchor?.y ?? height * 0.35) - 90, height - contentHeight - 70),
  );
  return (
    <Modal
      transparent
      visible={!forwardPending}
      onRequestClose={close}
      animationType="none"
      onDismiss={() => {
        if (forwardPending) forward();
      }}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={close}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('compose.close')}
            onPress={close}
          />
          <KeyboardAvoidingView
            style={[styles.position, { marginTop: picker ? 12 : top }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, own && styles.own]}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onContentSizeChange={(_, size) => setContentHeight(size)}
            >
              {!call && !picker && (
                <View
                  style={[styles.reactions, { maxWidth: fontScale > 1.3 ? '100%' : 380 }]}
                  testID="message-reaction-bar"
                >
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.reactionRow}
                  >
                    {quickReactions.map((value) => (
                      <FocusPressable
                        key={value}
                        style={styles.reaction}
                        accessibilityRole="button"
                        accessibilityLabel={t('messenger.reactWith', { emoji: value })}
                        disabled={busy}
                        onPress={() => react(value)}
                      >
                        <AppText style={styles.emoji}>{value}</AppText>
                      </FocusPressable>
                    ))}
                  </ScrollView>
                  <IconButton
                    icon="plus"
                    label={t('messenger.moreReactions')}
                    disabled={busy}
                    onPress={() => setPicker(true)}
                  />
                </View>
              )}
              {!picker && (
                <View pointerEvents="none" style={styles.preview} testID="selected-message-preview">
                  <MessageBubble own={own} status={message.status} sentAt={message.sentAt}>
                    <AppText numberOfLines={8}>{preview}</AppText>
                  </MessageBubble>
                </View>
              )}
              {picker ? (
                <View style={styles.picker}>
                  <View style={ui.row}>
                    <AppText variant="headline" style={ui.flex}>
                      {t('messenger.chooseEmoji')}
                    </AppText>
                    <IconButton
                      icon="x"
                      label={t('common.back')}
                      onPress={() => setPicker(false)}
                    />
                  </View>
                  <View style={styles.emojiGrid}>
                    {moreReactions.map((value) => (
                      <FocusPressable
                        key={value}
                        style={styles.reaction}
                        accessibilityRole="button"
                        accessibilityLabel={t('messenger.reactWith', { emoji: value })}
                        disabled={busy}
                        onPress={() => react(value)}
                      >
                        <AppText style={styles.emoji}>{value}</AppText>
                      </FocusPressable>
                    ))}
                  </View>
                  <Field
                    label={t('messenger.emojiKeyboard')}
                    value={emoji}
                    onChangeText={setEmoji}
                    maxLength={24}
                    autoCorrect={false}
                  />
                  <Button
                    label={t('messenger.addReaction')}
                    variant="accent"
                    disabled={!isReactionEmoji(emoji) || busy}
                    onPress={() => react(emoji)}
                  />
                </View>
              ) : (
                <View style={styles.menu} testID="message-action-menu">
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
                      <AppText
                        variant="bodyMedium"
                        style={[ui.flex, item.icon === 'trash-2' && styles.danger]}
                      >
                        {item.label}
                      </AppText>
                    </FocusPressable>
                  ))}
                  {info && (
                    <AppText variant="caption" tone="secondary">
                      {formatDate(new Date(message.sentAt).toISOString())},{' '}
                      {formatTime(new Date(message.sentAt).toISOString())}
                      {own ? ' · ' + t(`messenger.${message.status}`) : ''}
                    </AppText>
                  )}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: theme.colors.scrim },
  position: { flexShrink: 1, marginHorizontal: 16, marginBottom: 16 },
  scroll: { flexGrow: 0 },
  content: { gap: 8, alignItems: 'flex-start' },
  own: { alignItems: 'flex-end' },
  preview: { width: '100%' },
  reactions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    padding: 4,
    alignSelf: 'stretch',
  },
  reactionRow: { alignItems: 'center' },
  reaction: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28, lineHeight: 38 },
  menu: {
    width: '86%',
    maxWidth: 320,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: 16,
    gap: 4,
  },
  action: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: 6,
  },
  danger: { color: theme.colors.error },
  picker: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: 16,
    gap: 16,
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
