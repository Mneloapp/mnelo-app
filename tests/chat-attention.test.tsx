import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatsScreen } from '@/messenger/screens/HomeScreens';
import { CountBadge } from '@/components/CountBadge';
import { callOutcome, readCallRecord } from '@/messenger/call-record';
import { alertKind, shouldAlert } from '@/messenger/notification-policy';
import { Field } from '@/components/ui';
import { StyleSheet } from 'react-native';
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const mockEngine = {
  contactRequests: jest.fn(async () => []),
  chatPage: jest.fn(async () => ({ rows: [], next: undefined })),
};
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: mockEngine, view: mockEngine }),
}));
test('Chats keeps search mounted while filters and clear search update the local query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <ChatsScreen />
    </QueryClientProvider>,
  );
  const input = screen.getByLabelText('Search chats');
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  await fireEvent.changeText(input, 'Development');
  await fireEvent.press(screen.getByRole('button', { name: 'Unread' }));
  await waitFor(() =>
    expect(mockEngine.chatPage).toHaveBeenCalledWith('unread', 'Development', undefined),
  );
  expect(screen.getByLabelText('Search chats')).toBe(input);
  await fireEvent.press(screen.getByRole('button', { name: 'Groups' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() => expect(mockEngine.chatPage).toHaveBeenCalledWith('group', '', undefined));
  expect(screen.getByRole('button', { name: 'Groups' })).toBeSelected();
});
test('count badge disappears at zero and bounds large visible counts while preserving the exact accessible count', async () => {
  const view = await render(<CountBadge count={120} label="120 unread messages" />);
  expect(screen.getByText('99+')).toBeOnTheScreen();
  expect(screen.getByLabelText('120 unread messages')).toBeOnTheScreen();
  await view.rerender(<CountBadge count={0} label="0 unread messages" />);
  expect(screen.queryByText('0')).toBeNull();
  expect(screen.queryByText('99+')).toBeNull();
});
test('native fields use font ascent/descent for one line and top alignment for multiline editing', async () => {
  const view = await render(<Field label="Name" placeholder="ქართული" />);
  let style = StyleSheet.flatten(screen.getByLabelText('Name').props.style);
  expect(style.lineHeight).toBeUndefined();
  expect(style.textAlignVertical).toBe('center');
  expect(style.height).toBeUndefined();
  await view.rerender(<Field label="Message" multiline />);
  style = StyleSheet.flatten(screen.getByLabelText('Message').props.style);
  expect(style.textAlignVertical).toBe('top');
});
test.each([
  [true, 'incoming', false, 'remote', 'missed'],
  [true, 'incoming', true, 'timeout', 'missed'],
  [true, 'incoming', false, 'local', 'declined'],
  [false, 'ringing', false, 'decline', 'declined'],
  [false, 'ringing', true, 'timeout', 'unanswered'],
  [true, 'connecting', true, 'local', 'failed'],
  [true, 'active', false, 'remote', 'ended'],
] as const)(
  'call outcome preserves incoming=%s status=%s failure=%s reason=%s',
  (incoming, status, failed, reason, expected) => {
    expect(callOutcome({ incoming, status }, failed, reason)).toBe(expected);
  },
);
test('old calls have unknown direction and notification payloads cannot choose an arbitrary route', () => {
  expect(readCallRecord('voice:ended').direction).toBe('unknown');
  expect(readCallRecord('video:incoming:missed')).toEqual({
    media: 'video',
    status: 'missed',
    direction: 'incoming',
  });
  expect(alertKind({ url: 'https://evil.example', kind: 'arbitrary' })).toBeNull();
  expect(alertKind({ kind: 'message' })).toBe('message');
  expect(shouldAlert(true, '/chat/123', '123', 'message')).toBe(false);
  expect(shouldAlert(false, '/chat/123', '123', 'message')).toBe(true);
  expect(shouldAlert(true, '/chat/456', '123', 'message')).toBe(true);
});
