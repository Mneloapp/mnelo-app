import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { MessageInfoNavigator } from '@/messenger/components/MessageInfoNavigator';
import { MessageTimeReveal } from '@/messenger/components/MessageMetadata';
import type { LocalMessage } from '@/messenger/model';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (fn: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(fn, [fn]);
  },
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/messenger/screens/MessageInfoScreen', () => ({
  MessageInfoContent: ({ preview, onBack }: { preview: LocalMessage; onBack: () => void }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text onPress={onBack}>Info: {preview.body}</Text>;
  },
}));
const message = { id: 'one', chatId: 'chat', body: 'Sent text' } as LocalMessage;
const event = {} as GestureResponderEvent;
const gesture = (dx: number, dy = 0, vx = 0) => ({ dx, dy, vx }) as PanResponderGestureState;

test('screen follows left drag from its initial grant, survives rerenders, commits once and returns via swipe or back', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  const timing = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
    start: (callback) => {
      (value as Animated.Value).setValue(config.toValue as number);
      callback?.({ finished: true });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  const info = jest.fn(),
    reply = jest.fn();
  const content = (label: string) => (
    <MessageInfoNavigator chat="chat">
      <View>
        <Text>Timeline</Text>
        <MessageTimeReveal onInfo={() => info()} onReply={reply} infoMessage={message}>
          <Text>{label}</Text>
        </MessageTimeReveal>
      </View>
    </MessageInfoNavigator>
  );
  const view = await render(content('Sent text'));
  const back = create.mock.calls[0]![0];
  const swipe = create.mock.calls[1]![0];
  expect(swipe.onMoveShouldSetPanResponderCapture!(event, gesture(-30, 80))).toBe(false);
  expect(swipe.onMoveShouldSetPanResponderCapture!(event, gesture(-30))).toBe(true);
  // RN resets dx to zero when granting the responder after movement begins.
  await act(() => swipe.onPanResponderGrant!(event, gesture(0)));
  await act(() => swipe.onPanResponderMove!(event, gesture(-45)));
  expect(screen.getByText('Info: Sent text')).toBeOnTheScreen();
  const panel = screen.getByTestId('message-info-panel');
  expect(StyleSheet.flatten(panel.props.style).transform[0].translateX).toBeGreaterThan(0);
  await view.rerender(content('Receipt updated'));
  expect(create).toHaveBeenCalledTimes(2);
  await act(() => swipe.onPanResponderRelease!(event, gesture(-110)));
  expect(info).not.toHaveBeenCalled();
  expect(reply).not.toHaveBeenCalled();
  expect(screen.getByTestId('message-info-panel').props.pointerEvents).toBe('auto');
  expect(back.onMoveShouldSetPanResponderCapture!(event, gesture(20))).toBe(true);
  await act(() => back.onPanResponderGrant!(event, gesture(0)));
  await act(() => back.onPanResponderMove!(event, gesture(100)));
  await act(() => back.onPanResponderRelease!(event, gesture(100)));
  expect(screen.queryByTestId('message-info-panel')).toBeNull();
  expect(screen.getByText('Timeline')).toBeOnTheScreen();
  swipe.onMoveShouldSetPanResponderCapture!(event, gesture(-30));
  await act(() => swipe.onPanResponderGrant!(event, gesture(0)));
  await act(() => swipe.onPanResponderRelease!(event, gesture(-110)));
  await fireEvent.press(screen.getByText('Info: Sent text'));
  expect(screen.queryByTestId('message-info-panel')).toBeNull();
  // A cancelled or short drag doesn't strand a partial screen.
  swipe.onMoveShouldSetPanResponderCapture!(event, gesture(-30));
  await act(() => swipe.onPanResponderGrant!(event, gesture(0)));
  await act(() => swipe.onPanResponderRelease!(event, gesture(-25)));
  expect(screen.queryByTestId('message-info-panel')).toBeNull();
  swipe.onMoveShouldSetPanResponderCapture!(event, gesture(-30));
  await act(() => swipe.onPanResponderGrant!(event, gesture(0)));
  await act(() => swipe.onPanResponderTerminate!(event, gesture(-100)));
  expect(screen.queryByTestId('message-info-panel')).toBeNull();
  create.mockRestore();
  timing.mockRestore();
});
