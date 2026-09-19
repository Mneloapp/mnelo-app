import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useDevice } from '../DeviceProvider';
import { exportChat } from '../export-chat';
import { useLocalAction } from '../screens/shared';

export function ChatSwipeActions({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: (actions: { onDelete: () => void; onExportDelete: () => void }) => ReactNode;
}) {
  const { engine, view } = useDevice();
  const { t } = useTranslation();
  const focused = useIsFocused();
  const action = useLocalAction();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const distance = Math.min(240, width - 72);
  const [offset] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  const origin = useRef(0);
  const scope = useRef<object | null>(null);
  useEffect(() => {
    scope.current = focused ? {} : null;
    return () => {
      scope.current = null;
    };
  }, [engine, view, id, focused]);
  const state = useRef({ open, distance, busy: action.busy, reduced });
  useEffect(() => {
    state.current = { open, distance, busy: action.busy, reduced };
  }, [open, distance, action.busy, reduced]);
  const settle = (value: boolean) => {
    setOpen(value);
    Animated.timing(offset, {
      toValue: value ? -distance : 0,
      duration: reduced ? 0 : 180,
      useNativeDriver: true,
    }).start();
  };
  useFocusEffect(
    useCallback(
      () => () => {
        setOpen(false);
        offset.setValue(0);
      },
      [offset],
    ),
  );
  const responder = useMemo(
    () =>
      // PanResponder stores these callbacks; refs are read only during gestures.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // Capture horizontal intent only; taps and vertical list scrolling stay native.
        onMoveShouldSetPanResponderCapture: (_event, g) =>
          !state.current.busy &&
          Math.abs(g.dx) > 12 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5 &&
          (g.dx < 0 || state.current.open),
        onPanResponderGrant: () => {
          offset.stopAnimation();
          origin.current = state.current.open ? -state.current.distance : 0;
        },
        onPanResponderMove: (_event, g) =>
          offset.setValue(Math.max(-state.current.distance, Math.min(0, origin.current + g.dx))),
        onPanResponderRelease: (_event, g) => {
          const next =
            g.vx < -0.4 || (g.vx <= 0.4 && origin.current + g.dx < -state.current.distance / 3);
          setOpen(next);
          Animated.timing(offset, {
            toValue: next ? -state.current.distance : 0,
            duration: state.current.reduced ? 0 : 180,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          setOpen(false);
          offset.setValue(0);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [offset],
  );
  function confirm(withExport: boolean) {
    const captured = scope.current;
    const owner = engine.currentIdentity()?.key;
    if (!captured || action.busy || !owner) return;
    const isCurrent = () => scope.current === captured && engine.currentIdentity()?.key === owner;
    Alert.alert(title, t(withExport ? 'messenger.exportDeleteHint' : 'messenger.deleteChatHint'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t(withExport ? 'messenger.exportDeleteChat' : 'messenger.deleteChat'),
        style: withExport ? 'default' : 'destructive',
        onPress: () =>
          void action.run(async () => {
            if (!isCurrent()) return;
            if (withExport)
              await exportChat(engine, view, id, { deleteAfterSaving: true, isCurrent });
            else await engine.deleteLocalChat(id);
            settle(false);
          }),
      },
    ]);
  }
  return (
    <View>
      <View style={styles.clip} {...responder.panHandlers}>
        <View
          style={[styles.actions, { width: distance }]}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        >
          <FocusPressable
            accessibilityRole="button"
            accessibilityLabel={t('messenger.exportDeleteChat')}
            disabled={!open || action.busy}
            onPress={() => confirm(true)}
            style={[styles.action, styles.export]}
          >
            <AppIcon name="download" color="#ffffff" />
            <AppText variant="caption" centered style={styles.label}>
              {t('messenger.exportDeleteChat')}
            </AppText>
          </FocusPressable>
          <FocusPressable
            accessibilityRole="button"
            accessibilityLabel={t('messenger.deleteChat')}
            disabled={!open || action.busy}
            onPress={() => confirm(false)}
            style={[styles.action, styles.delete]}
          >
            <AppIcon name="trash-2" color="#ffffff" />
            <AppText variant="caption" centered style={styles.label}>
              {t('messenger.deleteChat')}
            </AppText>
          </FocusPressable>
        </View>
        <Animated.View style={[styles.front, { transform: [{ translateX: offset }] }]}>
          {/* The render prop forwards event handlers; it does not invoke them. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {children({ onDelete: () => confirm(false), onExportDelete: () => confirm(true) })}
        </Animated.View>
      </View>
      {action.busy && (
        <AppText variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {t('messenger.exportPreparing')}
        </AppText>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: {
    flex: 1,
    minHeight: 72,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  export: { backgroundColor: theme.colors.success },
  delete: { backgroundColor: theme.colors.error },
  label: { color: '#ffffff' },
  front: { backgroundColor: theme.colors.background, minHeight: 96, justifyContent: 'center' },
});
