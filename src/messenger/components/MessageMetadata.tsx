import { useMemo, useState, type PropsWithChildren } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import geometry from '../../../assets/brand/geometry.json';
import type { LocalMessage } from '../model';

export function DeliveryLeaf({ status }: { status: LocalMessage['status'] }) {
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
        width={theme.icons.sm}
        height={theme.spacing.step}
        viewBox="61 17 42 62"
        accessible={false}
      >
        <Path
          d={geometry.leaf}
          fill={read ? theme.colors.accent : 'none'}
          stroke={read ? theme.colors.success : theme.colors.textSecondary}
          strokeWidth={3}
        />
      </Svg>
    </View>
  );
}

export function MessageTimeReveal({
  sentAt,
  children,
  onReply,
}: PropsWithChildren<{ sentAt: number; onReply?: () => void }>) {
  const [offset] = useState(() => new Animated.Value(0));
  const distance = theme.layout.messageTimeReveal;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          (gesture.dx < -theme.spacing.sm || Boolean(onReply && gesture.dx > theme.spacing.sm)) &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_event, gesture) =>
          offset.setValue(Math.max(-distance, Math.min(onReply ? distance : 0, gesture.dx))),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > distance * 0.65) onReply?.();
          Animated.spring(offset, {
            toValue: 0,
            useNativeDriver: true,
            overshootClamping: true,
          }).start();
        },
        onPanResponderTerminate: () => offset.setValue(0),
      }),
    [distance, offset, onReply],
  );
  return (
    <View style={styles.row}>
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.time,
          {
            opacity: offset.interpolate({
              inputRange: [-distance, 0],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <AppText variant="caption" tone="secondary">
          {new Date(sentAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </AppText>
      </Animated.View>
      <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: offset }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { overflow: 'hidden' },
  time: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    width: theme.layout.messageTimeReveal,
    alignItems: 'flex-end',
  },
  leaf: { alignSelf: 'flex-end', paddingTop: theme.spacing.xs },
});
