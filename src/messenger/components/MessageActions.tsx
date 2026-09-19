import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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
import { createMenuGesture, menuHit, menuTouchPoint, type MenuGesture } from '../menu-gesture';
import { MessageBubble } from './MessageBubble';
export type MessageAnchor = { x: number; y: number; width: number; height: number };

export function MessageActions({
  message,
  inline = false,
  gesture,
  own = false,
  reduceMotion,
  anchor,
  close,
  reply,
  forward,
  copy,
  remove,
  react,
  retry,
  busy,
  quickEmojis = quickReactions,
  edit,
  removeEverywhere,
  showInfo,
}: {
  message: LocalMessage;
  inline?: boolean;
  gesture?: MenuGesture;
  own?: boolean;
  reduceMotion?: boolean;
  anchor?: MessageAnchor | undefined;
  close: () => void;
  reply: () => void;
  forward: () => void;
  copy: () => void;
  remove: () => void;
  react: (emoji: string) => void;
  retry: () => void;
  busy: boolean;
  quickEmojis?: readonly string[] | undefined;
  edit?: () => void;
  removeEverywhere?: () => void;
  showInfo?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const observedReducedMotion = useReducedMotion();
  const reducedMotion = reduceMotion ?? observedReducedMotion;
  const [progress] = useState(() => new Animated.Value(0));
  const [visible, setVisible] = useState(true);
  const completion = useRef<(() => void) | null>(null);
  const closing = useRef(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [previewY, setPreviewY] = useState(0);
  const [menuHeight, setMenuHeight] = useState(420);
  useEffect(() => {
    if (!contentHeight || closing.current) return;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reducedMotion ? 0 : 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [contentHeight, progress, reducedMotion]);
  const finishDismiss = useCallback(() => {
    const action = completion.current;
    completion.current = null;
    action?.();
  }, []);
  const dismiss = useCallback(
    (action?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      completion.current = () => {
        close();
        action?.();
      };
      if (reducedMotion) {
        progress.setValue(0);
        setVisible(false);
        if (inline || Platform.OS !== 'ios') finishDismiss();
        return;
      }
      Animated.timing(progress, {
        toValue: 0,
        duration: reducedMotion ? 0 : 170,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setVisible(false);
        if (inline || Platform.OS !== 'ios') finishDismiss();
      });
    },
    [close, finishDismiss, progress, reducedMotion, inline],
  );
  const [picker, setPicker] = useState(false),
    [emoji, setEmoji] = useState(''),
    [info, setInfo] = useState(false);
  const deleted = message.kind === 'deleted';
  const call = message.kind === 'call' ? readCallRecord(message.body) : null;
  const preview = call
    ? `${t(call.media === 'video' ? 'messenger.callVideo' : 'messenger.callVoice')} · ${t(callOutcomeCopy[call.status])}`
    : deleted
      ? t('messenger.deletedMessage')
      : message.body || t(message.kind === 'image' ? 'messenger.openPhoto' : 'common.more');
  const actions: { icon: IconName; label: string }[] = [
    ...(!call && !deleted
      ? [
          { icon: 'corner-up-left' as const, label: t('messenger.reply') },
          { icon: 'corner-up-right' as const, label: t('messenger.forward') },
        ]
      : []),
    ...(!call && !deleted && message.body
      ? [{ icon: 'copy' as const, label: t('messenger.copy') }]
      : []),
    { icon: 'info', label: t('messenger.messageInfo') },
    ...(own && message.kind === 'text' && edit
      ? [{ icon: 'edit-2' as const, label: t('messenger.editMessage') }]
      : []),
    ...(!call && message.status === 'pending'
      ? [{ icon: 'refresh-cw' as const, label: t('messenger.retry') }]
      : []),
    {
      icon: 'trash-2',
      label: t(
        own && !call && !deleted && removeEverywhere
          ? 'messenger.deleteEveryone'
          : 'messenger.deleteLocal',
      ),
    },
  ];
  function performAction(icon: IconName) {
    switch (icon) {
      case 'corner-up-left':
        dismiss(reply);
        break;
      case 'corner-up-right':
        dismiss(forward);
        break;
      case 'copy':
        dismiss(copy);
        break;
      case 'info':
        if (showInfo) dismiss(showInfo);
        else setInfo((value) => !value);
        break;
      case 'edit-2':
        dismiss(edit);
        break;
      case 'refresh-cw':
        dismiss(retry);
        break;
      case 'trash-2':
        dismiss(own && !call && !deleted && removeEverywhere ? removeEverywhere : remove);
        break;
    }
  }
  const [localGesture] = useState(createMenuGesture);
  const gestures = gesture ?? localGesture;
  const targets = useRef(new Map<string, { node: View; action: () => void }>());
  const [hovered, setHovered] = useState<string | null>(null);
  const dragSequence = useRef(0);
  useEffect(
    () =>
      gestures.listen((touch) => {
        const sequence = ++dragSequence.current;
        if (touch.phase === 'cancel' || busy || picker || closing.current) {
          setHovered(null);
          return;
        }
        const entries = [...targets.current];
        let remaining = entries.length;
        let hit: { id: string; action: () => void } | null = null;
        for (const [id, target] of entries) {
          target.node.measureInWindow((x, y, width, height) => {
            if (menuHit(touch.point, { x, y, width, height })) hit = { id, action: target.action };
            if (--remaining || sequence !== dragSequence.current || closing.current) return;
            setHovered(touch.phase === 'release' ? null : (hit?.id ?? null));
            if (touch.phase === 'release') hit?.action();
          });
        }
      }),
    [gestures, busy, picker],
  );
  const registerTarget = (id: string, node: View | null, action: () => void) => {
    if (node) targets.current.set(id, { node, action });
    else targets.current.delete(id);
  };
  const lastPoint = useRef({ x: -1, y: -1 });
  const touchPoint = (event: GestureResponderEvent) => {
    lastPoint.current = menuTouchPoint(event.nativeEvent, lastPoint.current);
    return lastPoint.current;
  };
  const available = height - insets.top - insets.bottom - 24;
  const previewLimit = Math.max(64, available - menuHeight - (!call && !deleted ? 64 : 0) - 24);
  const top = picker
    ? 12
    : Math.max(
        12,
        Math.min(
          (anchor?.y ?? height * 0.35) - insets.top - previewY,
          available - contentHeight + 12,
        ),
      );
  const lift = anchor && !picker ? anchor.y - insets.top - top - previewY : 12;
  const translation = progress.interpolate({ inputRange: [0, 1], outputRange: [lift, 0] });
  const content = (
    <View
      testID="message-menu-touch-surface"
      style={[styles.overlay, inline && StyleSheet.absoluteFill]}
      onMoveShouldSetResponderCapture={() => !picker}
      onResponderGrant={(event) => gestures.update({ phase: 'move', point: touchPoint(event) })}
      onResponderMove={(event) => gestures.update({ phase: 'move', point: touchPoint(event) })}
      onResponderRelease={(event) => {
        gestures.update({ phase: 'release', point: touchPoint(event) });
      }}
      onResponderTerminate={(event) => {
        gestures.update({ phase: 'cancel', point: touchPoint(event) });
      }}
      onResponderTerminationRequest={() => false}
    >
      <View style={styles.overlay} accessibilityViewIsModal onAccessibilityEscape={() => dismiss()}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.colors.scrim, opacity: progress },
          ]}
        />
        <Pressable
          testID="message-actions-backdrop"
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('compose.close')}
          onPress={() => dismiss()}
        />
        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={[styles.position, { top: insets.top + top, maxHeight: available - top + 12 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            pointerEvents="box-none"
            style={{
              opacity: contentHeight ? 1 : 0,
              transform: [{ translateY: translation }],
              maxHeight: available - top + 12,
            }}
          >
            <ScrollView
              testID="message-actions-content"
              style={[styles.scroll, { maxHeight: available - top + 12 }]}
              contentContainerStyle={[styles.content, own && styles.own]}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onContentSizeChange={(_, size) => setContentHeight(size)}
            >
              <Pressable
                testID="message-actions-content-backdrop"
                style={StyleSheet.absoluteFill}
                accessible={false}
                onPress={() => dismiss()}
              />
              {!call && !deleted && !picker && (
                <Animated.View
                  style={[
                    styles.reactions,
                    { opacity: progress },
                    { width: Math.min(width - 32, quickEmojis.length * 48 + 56) },
                  ]}
                  testID="message-reaction-bar"
                >
                  <ScrollView
                    style={styles.reactionScroll}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.reactionRow}
                  >
                    {quickEmojis.map((value) => (
                      <View
                        key={value}
                        collapsable={false}
                        ref={(node) =>
                          registerTarget('emoji:' + value, node, () => dismiss(() => react(value)))
                        }
                        testID={'message-menu-target-emoji-' + value}
                      >
                        <FocusPressable
                          style={[styles.reaction, hovered === 'emoji:' + value && styles.hover]}
                          accessibilityRole="button"
                          accessibilityLabel={t('messenger.reactWith', { emoji: value })}
                          disabled={busy}
                          onPress={() => dismiss(() => react(value))}
                        >
                          <AppText style={styles.emoji}>{value}</AppText>
                        </FocusPressable>
                      </View>
                    ))}
                  </ScrollView>
                  <View
                    collapsable={false}
                    ref={(node) => registerTarget('more', node, () => setPicker(true))}
                    testID="message-menu-target-more"
                    style={hovered === 'more' && styles.hover}
                  >
                    <IconButton
                      icon="plus"
                      label={t('messenger.moreReactions')}
                      disabled={busy}
                      onPress={() => setPicker(true)}
                    />
                  </View>
                </Animated.View>
              )}
              {!picker && (
                <View
                  pointerEvents="box-only"
                  style={[
                    styles.preview,
                    { width: Math.min(anchor?.width ?? width - 32, width - 32) },
                  ]}
                  onLayout={(event) => setPreviewY(event.nativeEvent.layout.y)}
                  testID="selected-message-preview"
                >
                  <MessageBubble
                    own={own}
                    status={message.status}
                    sentAt={message.sentAt}
                    containerStyle={styles.previewBubble}
                  >
                    <ScrollView
                      style={{ maxHeight: previewLimit - 40 }}
                      bounces={false}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      <AppText>{preview}</AppText>
                    </ScrollView>
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
                        onPress={() => dismiss(() => react(value))}
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
                    onPress={() => dismiss(() => react(emoji))}
                  />
                </View>
              ) : (
                <Animated.View
                  style={[styles.menu, { opacity: progress }]}
                  testID="message-action-menu"
                  onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
                >
                  {actions.map((item) => (
                    <View
                      key={item.icon}
                      collapsable={false}
                      ref={(node) =>
                        registerTarget(item.icon, node, () => performAction(item.icon))
                      }
                      testID={'message-menu-target-' + item.icon}
                    >
                      <FocusPressable
                        style={[styles.action, hovered === item.icon && styles.hover]}
                        accessibilityRole="button"
                        onPress={() => performAction(item.icon)}
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
                    </View>
                  ))}
                  {info && (
                    <AppText variant="caption" tone="secondary">
                      {formatDate(new Date(message.sentAt).toISOString())},{' '}
                      {formatTime(new Date(message.sentAt).toISOString())}
                      {own ? ' · ' + t(`messenger.${message.status}`) : ''}
                    </AppText>
                  )}
                </Animated.View>
              )}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
  if (inline) return visible ? content : null;
  return (
    <Modal
      testID="message-actions-modal"
      transparent
      visible={visible}
      onRequestClose={() => dismiss()}
      animationType="none"
      onDismiss={finishDismiss}
    >
      {content}
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1 },
  hover: { backgroundColor: theme.colors.border, borderRadius: 14 },
  position: { position: 'absolute', left: 16, right: 16 },
  scroll: { flexGrow: 0 },
  content: { gap: 8, alignItems: 'flex-start' },
  own: { alignItems: 'flex-end' },
  preview: { maxWidth: '100%' },
  previewBubble: { width: '100%', maxWidth: '100%', marginHorizontal: 0, marginVertical: 0 },
  reactions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
    padding: 4,
  },
  reactionScroll: { flexGrow: 0, flexShrink: 1 },
  reactionRow: { alignItems: 'center' },
  reaction: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28, lineHeight: 38 },
  menu: {
    width: '100%',
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
    paddingHorizontal: 8,
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
