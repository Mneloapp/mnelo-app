import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { DeviceNotifications } from '@/messenger/DeviceNotifications';
import type { IncomingMessage } from '@/messenger/engine';
const mockPreview = jest.fn(
  async (): Promise<{ title: string; body: string; chat: string } | null> => null,
);
jest.mock('@/messenger/notification-presentation', () => ({
  localNotificationPreview: (...args: unknown[]) => mockPreview(...(args as [])),
}));
let mockPath = '/chat/open';
let mockReceive = (_message: IncomingMessage) => {};
const mockChat = jest.fn(async () => ({ title: 'Development Alice' }));
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  router: { push: jest.fn(), navigate: jest.fn() },
}));
jest.mock('@/hooks/useAppActive', () => ({ useAppActive: () => true }));
const mockDevice = {
  authenticated: true,
  identity: { key: 'fixture' },
  calls: null,
  engine: {
    subscribeIncoming: (fn: typeof mockReceive) => {
      mockReceive = fn;
      return () => {};
    },
    chat: mockChat,
  },
};
jest.mock('@/messenger/DeviceProvider', () => ({ useDevice: () => mockDevice }));
jest.mock('@/messenger/attention', () => ({ useAttentionCounts: () => ({ data: undefined }) }));
jest.mock('@/messenger/useNotificationEnrollment', () => ({ useNotificationEnrollment: () => {} }));
jest.mock('@/messenger/system-calls', () => ({ systemCallAudio: () => true }));
jest.mock('@/messenger/device-alerts', () => ({
  showDeviceAlert: jest.fn(async () => {}),
  dismissDeviceAlert: jest.fn(async () => {}),
  presentedAlertIds: async () => [],
  setDeviceBadge: async () => {},
  observeAlertTaps: () => () => {},
}));
test('same visible conversation is silent; another conversation shows its local name and clears on opening', async () => {
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  const view = await render(<DeviceNotifications />);
  await act(async () => mockReceive({ id: 'one', chat: 'open', type: 'message' }));
  expect(screen.queryByText('New message')).toBeNull();
  expect(mockChat).not.toHaveBeenCalled();
  await act(async () => mockReceive({ id: 'two', chat: 'other', type: 'message' }));
  await waitFor(() => expect(screen.getByText('Development Alice')).toBeOnTheScreen());
  mockPath = '/chat/other';
  await view.rerender(<DeviceNotifications />);
  expect(screen.queryByText('Development Alice')).toBeNull();
});

test('foreground message presents its locally resolved sender and body, and opens its exact conversation', async () => {
  mockPath = '/(tabs)/chats';
  mockPreview.mockResolvedValue({ title: 'Saved friend ❤️', body: 'Private hello', chat: 'other' });
  await render(<DeviceNotifications />);
  await act(async () => mockReceive({ id: 'three', chat: 'other', type: 'message' }));
  await screen.findByText('Saved friend ❤️');
  expect(screen.getByText('Private hello')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Private hello'));
  expect(jest.requireMock('expo-router').router.push).toHaveBeenCalledWith({
    pathname: '/chat/[id]',
    params: { id: 'other' },
  });
});
