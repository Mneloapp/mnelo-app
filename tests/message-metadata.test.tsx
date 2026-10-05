import { MessageBubble } from '@/messenger/components/MessageBubble';
import { AppText } from '@/components/AppText';
import { formatTime } from '@/i18n/format';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  Animated,
  PanResponder,
  Pressable,
  type PanResponderGestureState,
  type GestureResponderEvent,
} from 'react-native';
import { DeliveryLeaf, MessageTimeReveal } from '@/messenger/components/MessageMetadata';

test('left swipe opens own-message info while right swipe replies and vertical/short gestures do neither', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  const spring = jest
    .spyOn(Animated, 'spring')
    .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  const reply = jest.fn(),
    info = jest.fn();
  const view = await render(
    <MessageTimeReveal onReply={reply} onInfo={info}>
      <AppText>Message</AppText>
    </MessageTimeReveal>,
  );
  const options = create.mock.calls.at(-1)![0];
  const event = {} as GestureResponderEvent;
  const gesture = (dx: number, dy = 0) => ({ dx, dy }) as PanResponderGestureState;
  expect(options.onMoveShouldSetPanResponder!(event, gesture(-70))).toBe(true);
  expect(options.onMoveShouldSetPanResponder!(event, gesture(70))).toBe(true);
  expect(options.onMoveShouldSetPanResponder!(event, gesture(-10, 70))).toBe(false);
  options.onMoveShouldSetPanResponder!(event, gesture(-70));
  await act(() => options.onPanResponderGrant!(event, gesture(0)));
  await act(() => options.onPanResponderRelease!(event, gesture(-70)));
  expect(info).toHaveBeenCalledTimes(1);
  expect(reply).not.toHaveBeenCalled();
  options.onMoveShouldSetPanResponder!(event, gesture(70));
  await act(() => options.onPanResponderGrant!(event, gesture(0)));
  await act(() => options.onPanResponderRelease!(event, gesture(70)));
  expect(reply).toHaveBeenCalledTimes(1);
  await act(() => options.onPanResponderRelease!(event, gesture(-2)));
  expect(info).toHaveBeenCalledTimes(1);
  await view.rerender(
    <MessageTimeReveal onReply={reply}>
      <AppText>Incoming</AppText>
    </MessageTimeReveal>,
  );
  expect(create.mock.calls.at(-1)![0].onMoveShouldSetPanResponder!(event, gesture(-70))).toBe(
    false,
  );
  create.mockRestore();
  spring.mockRestore();
});
test('no delivery leaf before acknowledgment or on received messages; accessible delivered/read states differ', async () => {
  const view = await render(<DeliveryLeaf status="pending" />);
  expect(screen.queryByRole('image')).toBeNull();
  await view.rerender(<DeliveryLeaf status="received" />);
  expect(screen.queryByRole('image')).toBeNull();
  await view.rerender(<DeliveryLeaf status="delivered" />);
  expect(screen.getByRole('image', { name: 'Delivered to their device' })).toBeOnTheScreen();
  await view.rerender(<DeliveryLeaf status="read" />);
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
});

test('both sides show a time without a gesture and only acknowledged outgoing messages show the small leaf', async () => {
  const sentAt = new Date('2026-09-13T13:37:00Z').getTime();
  const page = await render(
    <MessageBubble own={false} status="received" sentAt={sentAt}>
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  expect(screen.getByText(formatTime(new Date(sentAt).toISOString()))).toBeOnTheScreen();
  expect(screen.queryByRole('image')).toBeNull();
  await page.rerender(
    <MessageBubble own status="pending" sentAt={sentAt}>
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  expect(screen.queryByRole('image')).toBeNull();
  await page.rerender(
    <MessageBubble own status="read" sentAt={sentAt}>
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
  expect(screen.getByTestId('message-metadata')).toHaveStyle({ flexDirection: 'row' });
});

test.each(['button', 'link'] as const)(
  'message cards preserve child %s actions without a nested focusable parent',
  async (role) => {
    const select = jest.fn();
    const open = jest.fn();
    await render(
      <MessageBubble
        own={false}
        status="received"
        interactiveChildren
        onLongPress={select}
        accessibilityLabel="Shared message"
      >
        <Pressable
          accessibilityRole={role}
          accessibilityLabel="Open contact or link"
          onPress={open}
        >
          <AppText>Open</AppText>
        </Pressable>
      </MessageBubble>,
    );
    const bubble = screen.getByTestId('message-bubble');
    // Native accessible=false does not suppress a web role/tab stop; both
    // contracts must avoid turning the child action into a nested control.
    expect(bubble.props.accessible).toBe(false);
    expect(bubble.props.focusable).toBe(false);
    expect(bubble.props.accessibilityRole).toBeUndefined();
    expect(bubble.props.accessibilityActions).toBeUndefined();
    await fireEvent.press(screen.getByRole(role, { name: 'Open contact or link' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    await fireEvent(bubble, 'longPress');
    expect(select).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  },
);

test('plain text messages retain their accessible more action', async () => {
  const select = jest.fn();
  await render(
    <MessageBubble
      own={false}
      status="received"
      onLongPress={select}
      accessibilityLabel="Plain message"
    >
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  const bubble = screen.getByRole('button', { name: 'Plain message' });
  expect(bubble.props.focusable).toBe(true);
  await fireEvent(bubble, 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
  expect(select).toHaveBeenCalledTimes(1);
});
