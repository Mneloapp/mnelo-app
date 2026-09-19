import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { showForegroundDeviceAlert } from '@/messenger/device-alerts.native';
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));
const handler = jest.requireMock('expo-notifications').setNotificationHandler.mock.calls[0][0];
const notification = (identifier: string, data: unknown = {}) => ({
  request: { identifier, content: { data } },
});
beforeEach(() => {
  AppState.currentState = 'active';
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as never);
});

test('unverified remote wakes and delayed background local alerts stay silent in foreground/inactive transitions', async () => {
  for (const state of ['active', 'inactive'] as const) {
    AppState.currentState = state;
    for (const data of [{ mnelo: { kind: 'message' } }, { kind: 'message' }, {}]) {
      const result = await handler.handleNotification(notification('unowned', data));
      expect(result.shouldShowBanner).toBe(false);
      expect(result.shouldPlaySound).toBe(false);
    }
  }
  AppState.currentState = 'background';
  expect((await handler.handleNotification(notification('background'))).shouldShowBanner).toBe(
    true,
  );
});

test('a verified local foreground notification uses the native banner exactly once, without the generic push duplicate', async () => {
  await showForegroundDeviceAlert('verified', 'message', 'Local preview', 'Saved name', () => true);
  const local = notification('mnelo-local-verified', { kind: 'message' });
  expect(await handler.handleNotification(local)).toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  });
  expect(
    (
      await handler.handleNotification(
        notification('remote', { mnelo: { kind: 'message', id: 'verified' } }),
      )
    ).shouldShowBanner,
  ).toBe(false);
  expect((await handler.handleNotification(local)).shouldShowBanner).toBe(false);
  await showForegroundDeviceAlert('verified', 'message', 'Local preview', 'Saved name', () => true);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test.each(['route', 'background', 'inactive'] as const)(
  'a %s change between scheduling and OS presentation cancels the foreground banner',
  async (change) => {
    let current = true;
    await showForegroundDeviceAlert(
      change,
      'message',
      'Local preview',
      'Saved name',
      () => current,
    );
    if (change === 'route') current = false;
    else AppState.currentState = change;
    const result = await handler.handleNotification(notification('mnelo-local-' + change));
    expect(result.shouldShowBanner).toBe(false);
    expect(result.shouldPlaySound).toBe(false);
  },
);

test('permission denial or navigation during a permission read does not schedule a foreground notification', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ granted: false } as never);
  await showForegroundDeviceAlert('denied', 'message', 'Hidden', 'Hidden', () => true);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  let finish!: (value: unknown) => void;
  let current = true;
  jest.mocked(Notifications.getPermissionsAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  const pending = showForegroundDeviceAlert(
    'changed',
    'message',
    'Hidden',
    'Hidden',
    () => current,
  );
  current = false;
  finish({ granted: true });
  await pending;
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
