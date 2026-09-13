import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import { SearchField } from './SearchField';
import { IconButton, ui } from './ui';

// Hysteresis ignores small finger movements and rubber-band settling at the top.
export function searchScrollIntent(previous: number, current: number, distance: number) {
  const delta = current - previous;
  const next = Math.sign(delta) === Math.sign(distance) ? distance + delta : delta;
  return {
    distance: next,
    reveal: current < -28 || (current >= 0 && next < -28),
    hide: current > 20 && next > 28,
  };
}
export function usePullSearch(value: string) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const gesture = useRef({ previous: 0, distance: 0, dragging: false });
  const reveal = () => setVisible(true);
  return {
    visible: visible || Boolean(value.trim()) || focused,
    reveal,
    close: () => {
      Keyboard.dismiss();
      setFocused(false);
      setVisible(false);
    },
    focus: (active: boolean) => {
      setFocused(active);
      if (active) setVisible(true);
    },
    scrollProps: {
      scrollEventThrottle: 16,
      alwaysBounceVertical: true,
      onScrollBeginDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        gesture.current = {
          previous: event.nativeEvent.contentOffset.y,
          distance: 0,
          dragging: true,
        };
      },
      onScrollEndDrag: () => {
        gesture.current.dragging = false;
      },
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const state = gesture.current,
          current = event.nativeEvent.contentOffset.y;
        if (!state.dragging) return;
        const intent = searchScrollIntent(state.previous, current, state.distance);
        state.previous = current;
        state.distance = intent.distance;
        if (intent.reveal) setVisible(true);
        if (intent.hide && !focused && !value.trim()) setVisible(false);
      },
    },
  };
}
export function PullSearch({
  label,
  value,
  onChangeText,
  visible,
  onFocusChange,
  onClose,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  visible: boolean;
  onFocusChange: (focused: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [height, setHeight] = useState(52);
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, reduceMotion, progress]);
  return (
    <Animated.View
      style={{
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
        opacity: progress,
        overflow: 'hidden',
      }}
      pointerEvents={visible ? 'auto' : 'none'}
      aria-hidden={!visible}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <View
        style={[ui.row, styles.content]}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        <View style={ui.flex}>
          <SearchField
            label={label}
            value={value}
            onChangeText={onChangeText}
            onFocusChange={onFocusChange}
          />
        </View>
        <IconButton
          icon="x"
          label={t('common.cancel')}
          onPress={() => {
            onChangeText('');
            onClose();
          }}
        />
      </View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({ content: { position: 'absolute', top: 0, left: 0, right: 0 } });
