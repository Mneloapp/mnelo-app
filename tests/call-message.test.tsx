import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CallBackSheet, CallMessage } from '@/messenger/components/CallMessage';
import { MessageActions } from '@/messenger/components/MessageActions';
import { theme } from '@/theme/tokens';
import { formatTime } from '@/i18n/format';
import { Platform } from 'react-native';
import type { LocalMessage } from '@/messenger/model';

const message: LocalMessage = {
  id: 'call',
  chatId: 'chat',
  sender: 'peer',
  kind: 'call',
  body: 'voice:outgoing:unanswered',
  sentAt: 1790000000000,
  receivedAt: 1790000000000,
  replyTo: null,
  attachment: null,
  status: 'read',
  sequence: 1,
};

test('an unanswered outgoing call is a right-aligned call card even though its stored sender is the peer', async () => {
  const open = jest.fn();
  await render(<CallMessage message={message} onPress={open} />);
  expect(screen.getByTestId('call-message')).toHaveStyle({
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.messageOutgoing,
  });
  expect(screen.getByText('Voice call')).toBeOnTheScreen();
  expect(screen.getByText('No answer')).toBeOnTheScreen();
  expect(screen.getByText(formatTime(new Date(message.sentAt).toISOString()))).toBeOnTheScreen();
  expect(screen.queryByTestId('message-bubble')).toBeNull();
  expect(screen.queryByRole('image', { name: 'Read on their device' })).toBeNull();
  expect(screen.queryByText(message.body)).toBeNull();
  await fireEvent.press(screen.getByTestId('call-message'));
  expect(open).toHaveBeenCalledTimes(1);
});

test('incoming missed video calls remain left aligned and red, with a callback hint', async () => {
  await render(
    <CallMessage message={{ ...message, body: 'video:incoming:missed' }} onPress={jest.fn()} />,
  );
  expect(screen.getByTestId('call-message')).toHaveStyle({ alignSelf: 'flex-start' });
  expect(screen.getByText('Missed video call')).toHaveStyle({ color: theme.colors.error });
  expect(screen.getByText('Tap to call back')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /Missed video call. Incoming/ })).toBeOnTheScreen();
});

test('legacy records without a direction are neutral instead of appearing as incoming messages', async () => {
  await render(<CallMessage message={{ ...message, body: 'voice:ended' }} onPress={jest.fn()} />);
  expect(screen.getByTestId('call-message')).toHaveStyle({ alignSelf: 'center' });
  expect(screen.getByRole('button').props.accessibilityLabel).not.toMatch(/Incoming|Outgoing/);
});

test.each(['voice', 'video'] as const)(
  'the %s callback sheet waits for explicit Call and keeps the original media type',
  async (media) => {
    const onCall = jest.fn(),
      onClose = jest.fn();
    await render(
      <CallBackSheet
        message={{ ...message, body: `${media}:outgoing:unanswered` }}
        name="Saved contact ❤️"
        available
        onClose={onClose}
        onCall={onCall}
      />,
    );
    expect(onCall).not.toHaveBeenCalled();
    expect(screen.getByText('Saved contact ❤️')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: media === 'voice' ? 'Call' : 'Video call' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCall).toHaveBeenCalledWith(media);
  },
);

test.each(['Cancel', 'Close'])(
  'the callback sheet dismisses using %s without dialing',
  async (label) => {
    const onCall = jest.fn(),
      onClose = jest.fn();
    await render(
      <CallBackSheet
        message={message}
        name="Saved contact"
        available
        onClose={onClose}
        onCall={onCall}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCall).not.toHaveBeenCalled();
  },
);

test('the callback sheet prevents unavailable calls while keeping dismissal available', async () => {
  const onCall = jest.fn();
  await render(
    <CallBackSheet
      message={message}
      name="Saved contact"
      available={false}
      onClose={jest.fn()}
      onCall={onCall}
    />,
  );
  expect(screen.getByRole('button', { name: 'Call' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Call' }));
  expect(onCall).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
});

test('holding a call retains local deletion without message reactions, replies or raw record text', async () => {
  const remove = jest.fn();
  await render(
    <MessageActions
      reduceMotion
      message={message}
      close={jest.fn()}
      reply={jest.fn()}
      forward={jest.fn()}
      copy={jest.fn()}
      react={jest.fn()}
      retry={jest.fn()}
      remove={remove}
      busy={false}
    />,
  );
  expect(screen.getByText('Voice call · No answer')).toBeOnTheScreen();
  expect(screen.queryByText(message.body)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'React with 👍' })).toBeNull();
  const dismiss = screen.getByTestId('message-actions-modal', { includeHiddenElements: true }).props
    .onDismiss;
  await fireEvent.press(screen.getByRole('button', { name: 'Delete from this device' }));
  if (Platform.OS === 'ios') await act(() => dismiss());
  expect(remove).toHaveBeenCalledTimes(1);
});
