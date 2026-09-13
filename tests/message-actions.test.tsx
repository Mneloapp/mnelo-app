import { act, fireEvent, render, screen, renderHook } from '@testing-library/react-native';
import { AppText } from '@/components/AppText';
import { MessageBubble } from '@/messenger/components/MessageBubble';
import { MessageActions } from '@/messenger/components/MessageActions';
import { useSentMessageScroll } from '@/messenger/useSentMessageScroll';
import { isReactionEmoji } from '@/messenger/reaction-emoji';
import type { LocalMessage } from '@/messenger/model';
import type { FlatList } from 'react-native';
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
const message: LocalMessage = {
  id: 'one',
  chatId: 'chat',
  sender: 'me',
  kind: 'text',
  body: 'The selected message',
  status: 'read',
  sentAt: 1790000000000,
  receivedAt: 1790000000000,
  replyTo: null,
  attachment: null,
  sequence: 1,
};
const actions = {
  close: jest.fn(),
  reply: jest.fn(),
  forward: jest.fn(),
  copy: jest.fn(),
  remove: jest.fn(),
  react: jest.fn(),
  retry: jest.fn(),
  busy: false,
};
test('a short tap on any bubble surface does nothing; holding it opens its actions', async () => {
  const select = jest.fn();
  await render(
    <MessageBubble own status="read" onLongPress={select}>
      <AppText>Text</AppText>
    </MessageBubble>,
  );
  await fireEvent.press(screen.getByTestId('message-bubble'));
  expect(select).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('message-bubble'), 'longPress');
  expect(select).toHaveBeenCalledTimes(1);
});
test('reactions, selected bubble and menu are separate surfaces and Copy copies only on demand', async () => {
  await render(
    <MessageActions
      message={message}
      own
      anchor={{ x: 120, y: 300, width: 230, height: 70 }}
      {...actions}
    />,
  );
  expect(screen.getByTestId('message-reaction-bar')).toBeVisible();
  expect(screen.getByTestId('selected-message-preview')).toBeVisible();
  expect(screen.getByTestId('message-action-menu')).toBeVisible();
  expect(actions.copy).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Copy text' }));
  expect(actions.copy).toHaveBeenCalledTimes(1);
});
test('More reactions supports both a larger grid and a joined emoji from the keyboard', async () => {
  await render(<MessageActions message={message} {...actions} />);
  await fireEvent.press(screen.getByRole('button', { name: 'More reactions' }));
  expect(screen.getByRole('button', { name: 'React with 🦋' })).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText('Or use any emoji from your keyboard'), 'hello');
  expect(screen.getByRole('button', { name: 'Add reaction' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Or use any emoji from your keyboard'), '👩🏽‍💻');
  await fireEvent.press(screen.getByRole('button', { name: 'Add reaction' }));
  expect(actions.react).toHaveBeenCalledWith('👩🏽‍💻');
});
test.each(['🇬🇪', '👩🏽‍💻', '1️⃣', '👍🏿', '❤️', '🫶', '🏳️‍🌈'])('supports emoji sequence %s', (value) =>
  expect(isReactionEmoji(value)).toBe(true),
);
test.each(['', 'hello', '👍😂', 'https://example.com', 'a👍', '123'])(
  'rejects non-emoji reaction %s',
  (value) => expect(isReactionEmoji(value)).toBe(false),
);
test('send jumps once after the sent message arrives; reading history and incoming messages do not jump', async () => {
  jest.useFakeTimers();
  const scrollToOffset = jest.fn();
  const { result, rerender } = await renderHook(
    ({ rows }: { rows: LocalMessage[] }) => useSentMessageScroll('chat', rows),
    { initialProps: { rows: [] as LocalMessage[] } },
  );
  result.current.listRef.current = { scrollToOffset } as unknown as FlatList<LocalMessage>;
  await act(async () => result.current.sent(message.id));
  await act(async () => jest.runOnlyPendingTimers());
  expect(scrollToOffset).not.toHaveBeenCalled();
  await rerender({ rows: [message] });
  await act(async () => jest.runOnlyPendingTimers());
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  await rerender({ rows: [{ ...message, id: 'incoming', sender: 'peer' }, message] });
  await act(async () => jest.runOnlyPendingTimers());
  expect(scrollToOffset).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
