import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  BackHandler,
  Keyboard,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';
import type { LocalMessage } from '../model';
import { MessageInfoContent } from '../screens/MessageInfoScreen';
import { MessageInfoNavigationContext } from './message-info-navigation';

// A single mounted chat owns the transition: message presses and swipe gestures
// open the same screen, and returning keeps the timeline and composer in place.
export function MessageInfoNavigator({ chat, children }: PropsWithChildren<{ chat: string }>) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [selected, setSelected] = useState<LocalMessage | null>(null);
  const [interactive, setInteractive] = useState(false);
  const phase = useRef<'closed' | 'dragging' | 'animating' | 'open'>('closed');
  const generation = useRef(0);
  const latest = useRef({ width, reduceMotion });
  useEffect(() => {
    latest.current = { width, reduceMotion };
  }, [width, reduceMotion]);
  const reset = useCallback(() => {
    generation.current++;
    phase.current = 'closed';
    progress.stopAnimation();
    progress.setValue(0);
    setSelected(null);
    setInteractive(false);
  }, [progress]);
  useFocusEffect(useCallback(() => reset, [reset]));
  const settle = useCallback(
    (open: boolean) => {
      const token = ++generation.current;
      phase.current = 'animating';
      setInteractive(false);
      Animated.timing(progress, {
        toValue: open ? 1 : 0,
        duration: latest.current.reduceMotion ? 0 : 210,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || generation.current !== token) return;
        phase.current = open ? 'open' : 'closed';
        setInteractive(open);
        if (!open) setSelected(null);
      });
    },
    [progress],
  );
  const close = useCallback(() => settle(false), [settle]);
  const navigation = useMemo(
    () => ({
      begin(message: LocalMessage) {
        if (phase.current !== 'closed' || message.chatId !== chat) return false;
        Keyboard.dismiss();
        progress.setValue(0);
        setSelected(message);
        phase.current = 'dragging';
        return true;
      },
      move(dx: number) {
        if (phase.current === 'dragging')
          progress.setValue(Math.max(0, Math.min(1, -dx / latest.current.width)));
      },
      end(dx: number, velocity: number, cancelled = false) {
        if (phase.current !== 'dragging') return;
        settle(
          !cancelled &&
            (-dx >= Math.min(80, latest.current.width * 0.22) || (dx < -16 && velocity < -0.5)),
        );
      },
      open(message: LocalMessage) {
        if (phase.current !== 'closed' || message.chatId !== chat) return;
        Keyboard.dismiss();
        setSelected(message);
        settle(true);
      },
    }),
    [chat, progress, settle],
  );
  const back = useMemo(
    () =>
      // PanResponder stores event callbacks; no ref is read during creation.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          phase.current === 'open' &&
          gesture.dx > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderGrant: () => {
          phase.current = 'dragging';
        },
        onPanResponderMove: (_event, gesture) =>
          progress.setValue(1 - Math.max(0, Math.min(1, gesture.dx / latest.current.width))),
        onPanResponderRelease: (_event, gesture) =>
          settle(
            !(
              gesture.dx >= Math.min(80, latest.current.width * 0.22) ||
              (gesture.dx > 16 && gesture.vx > 0.5)
            ),
          ),
        onPanResponderTerminate: () => settle(true),
        onPanResponderTerminationRequest: () => false,
      }),
    [progress, settle],
  );
  useEffect(() => {
    if (!selected) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [selected, close]);
  return (
    <MessageInfoNavigationContext.Provider value={navigation}>
      <Stack.Screen options={{ gestureEnabled: !selected }} />
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.fill,
            {
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -width * 0.25],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={interactive ? 'none' : 'auto'}
          accessibilityElementsHidden={Boolean(selected)}
          importantForAccessibility={selected ? 'no-hide-descendants' : 'auto'}
        >
          {children}
        </Animated.View>
        {selected && (
          <Animated.View
            testID="message-info-panel"
            {...back.panHandlers}
            pointerEvents={interactive ? 'auto' : 'none'}
            accessibilityViewIsModal
            style={[
              styles.fill,
              {
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [width, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <MessageInfoContent id={selected.id} chat={chat} preview={selected} onBack={close} />
          </Animated.View>
        )}
      </View>
    </MessageInfoNavigationContext.Provider>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: theme.colors.background },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
  },
});
