import { act, render, screen } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { DeviceNotifications } from '@/messenger/DeviceNotifications';
import { showDeviceAlert, showForegroundDeviceAlert } from '@/messenger/device-alerts';
import type { IncomingMessage } from '@/messenger/engine';
jest.mock('@/messenger/useNotificationNavigation', () => ({ useNotificationNavigation: () => {} }));
const mockPreview = jest.fn(
  async (): Promise<{ title: string; body: string; chat: string } | null> => null,
);
jest.mock('@/messenger/notification-presentation', () => ({
  localNotificationPreview: (...args: unknown[]) => mockPreview(...(args as [])),
}));
let mockPath = '/chat/open';
let mockReceive = (_message: IncomingMessage) => {};
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));
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
  },
};
jest.mock('@/messenger/DeviceProvider', () => ({ useDevice: () => mockDevice }));
jest.mock('@/messenger/attention', () => ({ useAttentionCounts: () => ({ data: undefined }) }));
jest.mock('@/messenger/useNotificationEnrollment', () => ({ useNotificationEnrollment: () => {} }));
jest.mock('@/messenger/system-calls', () => ({ systemCallAudio: () => true }));
jest.mock('@/messenger/device-alerts', () => ({
  showDeviceAlert: jest.fn(async () => {}),
  showForegroundDeviceAlert: jest.fn(async () => {}),
  dismissDeviceAlert: jest.fn(async () => {}),
  presentedAlertIds: async () => [],
  setDeviceBadge: async () => {},
  observeAlertTaps: () => () => {},
}));
beforeEach(() => {
  AppState.currentState = 'active';
  mockPath = '/chat/open';
  mockPreview.mockReset().mockResolvedValue(null);
  mockDevice.authenticated = true;
});
test('same visible conversation is silent; another conversation schedules one native banner and no custom overlay', async () => {
  const view = await render(<DeviceNotifications />);
  await act(async () => mockReceive({ id: 'one', chat: 'open', type: 'message' }));
  expect(showForegroundDeviceAlert).not.toHaveBeenCalled();
  expect(mockPreview).not.toHaveBeenCalled();
  mockPreview.mockResolvedValueOnce({
    title: 'Saved friend ❤️',
    body: 'Private hello',
    chat: 'other',
  });
  await act(async () => mockReceive({ id: 'two', chat: 'other', type: 'message' }));
  expect(showForegroundDeviceAlert).toHaveBeenCalledTimes(1);
  expect(showForegroundDeviceAlert).toHaveBeenCalledWith(
    'two',
    'message',
    'Private hello',
    'Saved friend ❤️',
    expect.any(Function),
  );
  expect(view.toJSON()).toBeNull();
  expect(screen.queryByText('Private hello')).toBeNull();
  const present = jest.mocked(showForegroundDeviceAlert).mock.calls[0]![4];
  expect(present()).toBe(true);
  mockPath = '/chat/other';
  await view.rerender(<DeviceNotifications />);
  expect(present()).toBe(false);
});

test('a delayed local preview produces no generic notification and cannot replace a newer message', async () => {
  let resolveOld!: (value: { title: string; body: string; chat: string }) => void;
  mockPreview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await render(<DeviceNotifications />);
  await act(async () => mockReceive({ id: 'older', chat: 'other', type: 'message' }));
  expect(showForegroundDeviceAlert).not.toHaveBeenCalled();
  mockPreview.mockResolvedValueOnce({ title: 'New sender', body: 'New text', chat: 'new' });
  await act(async () => mockReceive({ id: 'newer', chat: 'new', type: 'message' }));
  await act(async () => resolveOld({ title: 'Old sender', body: 'Old text', chat: 'other' }));
  expect(showForegroundDeviceAlert).toHaveBeenCalledTimes(1);
  expect(showForegroundDeviceAlert).toHaveBeenCalledWith(
    'newer',
    'message',
    'New text',
    'New sender',
    expect.any(Function),
  );
});

test.each(['background', 'unmount', 'sign-out'])(
  '%s invalidates an already scheduled foreground presentation',
  async (change) => {
    mockPreview.mockResolvedValueOnce({ title: 'Friend', body: 'Hello', chat: 'other' });
    const view = await render(<DeviceNotifications />);
    await act(async () => mockReceive({ id: change, chat: 'other', type: 'message' }));
    const present = jest.mocked(showForegroundDeviceAlert).mock.calls[0]![4];
    if (change === 'background') AppState.currentState = 'background';
    else if (change === 'unmount') await view.unmount();
    else {
      mockDevice.authenticated = false;
      await view.rerender(<DeviceNotifications />);
    }
    expect(present()).toBe(false);
  },
);

test('unavailable private preview has only generic copy, while background delivery keeps its existing system path', async () => {
  await render(<DeviceNotifications />);
  await act(async () => mockReceive({ id: 'unknown-preview', chat: 'other', type: 'message' }));
  expect(showForegroundDeviceAlert).toHaveBeenCalledWith(
    'unknown-preview',
    'message',
    'New message',
    'Mnelo',
    expect.any(Function),
  );
  AppState.currentState = 'background';
  mockPreview.mockResolvedValueOnce({ title: 'Friend', body: 'Background hello', chat: 'other' });
  await act(async () => mockReceive({ id: 'background', chat: 'other', type: 'message' }));
  expect(showDeviceAlert).toHaveBeenCalledWith(
    'background',
    'message',
    'Background hello',
    'Friend',
  );
});
