import { Alert, View } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AppText } from '@/components/AppText';
import { MessageBubble } from '@/messenger/components/MessageBubble';
import { ChatOptions } from '@/messenger/components/ChatOptions';
import { ChatPhoto } from '@/messenger/components/ChatPhoto';
import { CallHistoryRow } from '@/messenger/components/CallHistoryRow';
import type { LocalCall } from '@/messenger/model';
import { theme } from '@/theme/tokens';
jest.mock('@/messenger/components/PhotoGallery', () => ({ PhotoGallery: () => null }));

test('reactions sit outside message content, group counts, and do not alter its copyable text', async () => {
  await render(
    <MessageBubble
      own
      status="read"
      reactions={[{ emoji: '👍' }, { emoji: '👍' }, { emoji: '❤️' }]}
    >
      <AppText>Hello friend</AppText>
    </MessageBubble>,
  );
  expect(within(screen.getByTestId('message-bubble')).getByText('Hello friend')).toBeOnTheScreen();
  expect(within(screen.getByTestId('message-bubble')).queryByText(/👍/)).toBeNull();
  expect(
    within(screen.getByTestId('message-reactions')).getByLabelText('👍, 2 reactions'),
  ).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
});

test('chat options dismiss from the scrim; tapping clear only prompts and does not erase history', async () => {
  const close = jest.fn(),
    erase = jest.fn(),
    contact = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(
    <ChatOptions visible busy={false} close={close} onContact={contact} onClear={erase} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(erase).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Contact card' }));
  expect(contact).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Clear history on this device' }));
  expect(erase).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0]?.[2];
  expect(buttons?.[0]?.style).toBe('cancel');
  buttons?.[1]?.onPress?.();
  expect(erase).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('photo viewer opens, exposes a separate save/share action, guards duplicate taps and closes', async () => {
  const share = jest.fn();
  const props = {
    uri: 'data:image/png;base64,fixture',
    name: 'Development image',
    share,
    onLongPress: jest.fn(),
    busy: false,
    error: null,
  };
  const rendered = await render(<ChatPhoto {...props} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save or share photo' }));
  expect(share).toHaveBeenCalledTimes(1);
  await rendered.rerender(<ChatPhoto {...props} busy />);
  expect(screen.getByRole('button', { name: 'Save or share photo' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('button', { name: 'Save or share photo' })).toBeNull();
});

const call: LocalCall = {
  id: 'fixture',
  chatId: 'chat',
  peer: 'peer',
  name: 'Development contact',
  media: 'voice',
  status: 'ended',
  direction: 'incoming',
  unseen: 0,
  endedAt: new Date('2026-09-13T09:30:00Z').getTime(),
  sequence: 1,
};
test('call rows distinguish direction and retain red missed state after the badge is read', async () => {
  const view = await render(
    <CallHistoryRow call={call} avatar={<View />} onPress={jest.fn()} now={call.endedAt} />,
  );
  expect(screen.getByText('Incoming')).toBeOnTheScreen();
  await view.rerender(
    <CallHistoryRow
      call={{ ...call, direction: 'outgoing' }}
      avatar={<View />}
      onPress={jest.fn()}
      now={call.endedAt}
    />,
  );
  expect(screen.getByText('Outgoing')).toBeOnTheScreen();
  await view.rerender(
    <CallHistoryRow
      call={{ ...call, status: 'missed', unseen: 0 }}
      avatar={<View />}
      onPress={jest.fn()}
      now={call.endedAt}
    />,
  );
  expect(screen.getByText('Incoming · Missed call')).toHaveStyle({ color: theme.colors.error });
  expect(screen.getByText('Development contact')).toHaveStyle({ color: theme.colors.error });
});
test('legacy call records do not invent a direction', async () => {
  await render(
    <CallHistoryRow
      call={{ ...call, direction: 'unknown' }}
      avatar={<View />}
      onPress={jest.fn()}
      now={call.endedAt}
    />,
  );
  expect(screen.getByText('Voice call')).toBeOnTheScreen();
  expect(screen.queryByText('Incoming')).toBeNull();
  expect(screen.queryByText('Outgoing')).toBeNull();
});
