import { MessageBubble } from '@/messenger/components/MessageBubble';
import { AppText } from '@/components/AppText';
import { formatTime } from '@/i18n/format';
import { act, render, screen } from '@testing-library/react-native';
import {
  Animated,
  PanResponder,
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
  await act(() => options.onPanResponderRelease!(event, gesture(-70)));
  expect(info).toHaveBeenCalledTimes(1);
  expect(reply).not.toHaveBeenCalled();
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
