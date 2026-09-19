import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
import geometry from '../../../assets/brand/geometry.json';
import { useMessageInfoNavigation } from './message-info-navigation';
import type { LocalMessage } from '../model';

export function DeliveryLeaf({
  status,
  overMedia = false,
}: {
  status: LocalMessage['status'];
  overMedia?: boolean;
}) {
  const { t } = useTranslation();
  if (status !== 'delivered' && status !== 'read') return null;
  const read = status === 'read';
  return (
    <View
      style={styles.leaf}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(`messenger.${status}`)}
    >
      <Svg
        width={12}
        height={16}
        viewBox="61 17 42 62"
        {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })}
      >
        <Path
          d={geometry.leaf}
          fill={read ? theme.colors.success : 'none'}
          stroke={
            overMedia
              ? theme.colors.callText
              : read
                ? theme.colors.success
                : theme.colors.textSecondary
          }
          strokeWidth={3}
        />
      </Svg>
    </View>
  );
}

export function MessageTimeReveal({
  children,
  onReply,
  onInfo,
  infoMessage,
}: PropsWithChildren<{
  onReply?: (() => void) | undefined;
  onInfo?: (() => void) | undefined;
  infoMessage?: LocalMessage | undefined;
}>) {
  const [offset] = useState(() => new Animated.Value(0));
  const navigation = useMessageInfoNavigation();
  const latest = useRef({ onReply, onInfo, infoMessage, navigation });
  useEffect(() => {
    latest.current = { onReply, onInfo, infoMessage, navigation };
  });
  const gestureState = useRef<{
    captured: typeof latest.current | null;
    infoDrag: boolean;
    direction: number;
  }>({ captured: null, infoDrag: false, direction: 0 });
  const distance = theme.layout.messageTimeReveal;
  const responder = useMemo(() => {
    const shouldStart = (_event: unknown, gesture: { dx: number; dy: number }) => {
      const current = latest.current;
      const claim =
        Boolean((current.onReply && gesture.dx > 10) || (current.onInfo && gesture.dx < -10)) &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
      if (claim) gestureState.current.direction = Math.sign(gesture.dx);
      return claim;
    };
    const reset = () =>
      Animated.spring(offset, {
        toValue: 0,
        useNativeDriver: true,
        overshootClamping: true,
      }).start();
    // PanResponder registers these callbacks; it does not invoke them during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onMoveShouldSetPanResponder: shouldStart,
      onMoveShouldSetPanResponderCapture: shouldStart,
      onPanResponderGrant: () => {
        const state = gestureState.current;
        const captured = latest.current;
        state.captured = captured;
        state.infoDrag = Boolean(
          state.direction < 0 &&
          captured.onInfo &&
          captured.infoMessage &&
          captured.navigation?.begin(captured.infoMessage),
        );
      },
      onPanResponderMove: (_event, gesture) => {
        const { captured, infoDrag } = gestureState.current;
        if (infoDrag) captured?.navigation?.move(gesture.dx);
        // Only a reply moves the bubble. Info moves the entire screen.
        else offset.setValue(Math.max(0, Math.min(captured?.onReply ? distance : 0, gesture.dx)));
      },
      onPanResponderRelease: (_event, gesture) => {
        const { captured, infoDrag } = gestureState.current;
        if (!captured) return;
        if (infoDrag) captured.navigation?.end(gesture.dx, gesture.vx);
        else if (gesture.dx > distance * 0.65) captured.onReply?.();
        else if (gesture.dx < -distance * 0.65) captured.onInfo?.();
        gestureState.current.captured = null;
        gestureState.current.infoDrag = false;
        reset();
      },
      onPanResponderTerminate: () => {
        const { captured, infoDrag } = gestureState.current;
        if (infoDrag) captured?.navigation?.end(0, 0, true);
        gestureState.current.captured = null;
        gestureState.current.infoDrag = false;
        offset.setValue(0);
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [distance, offset]);
  return (
    <View style={styles.row}>
      <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: offset }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { minWidth: 0 },
  leaf: { alignItems: 'center', justifyContent: 'center' },
});
