import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  showForegroundDeviceAlert,
  showDeviceAlert,
  presentedAlertIds,
  dismissDeviceAlert,
} from '@/messenger/device-alerts.native';
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPresentedNotificationsAsync: jest.fn(async () => []),
  dismissNotificationAsync: jest.fn(async () => {}),
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
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockReset().mockResolvedValue([]);
});

const remotePush = (id: string, kind = 'message') =>
  ({
    date: 1,
    request: {
      identifier: `apple-${id}`,
      content: { data: null },
      trigger: { type: 'push', payload: { mnelo: { v: 1, kind, id } } },
    },
  }) as unknown as Notifications.Notification;

test.each(['active', 'background'] as const)(
  'opening from the app icon in %s does not replay an OS-delivered push',
  async (state) => {
    AppState.currentState = state;
    const id = `already-shown-${state}`;
    jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([remotePush(id)]);
    if (state === 'active')
      await showForegroundDeviceAlert(id, 'message', 'Preview', 'Contact', () => true);
    else await showDeviceAlert(id, 'message', 'Preview', 'Contact');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  },
);

test('cleanup recognizes APNs IDs and remembers display when cleanup precedes inbox replay', async () => {
  const id = 'cleanup-before-replay';
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([remotePush(id)]);
  expect(await presentedAlertIds()).toEqual([id]);
  await dismissDeviceAlert(id);
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(`apple-${id}`);
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockResolvedValue([]);
  await showForegroundDeviceAlert(id, 'message', 'Preview', 'Contact', () => true);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  await showForegroundDeviceAlert(
    'new-unrelated-message',
    'message',
    'Preview',
    'Contact',
    () => true,
  );
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('a hidden foreground push cannot suppress the verified banner for a new message', async () => {
  const id = 'hidden-live-push';
  expect((await handler.handleNotification(remotePush(id))).shouldShowBanner).toBe(false);
  await showForegroundDeviceAlert(id, 'message', 'Preview', 'Contact', () => true);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('an earlier incoming-call alert does not hide its distinct missed-call result', async () => {
  const id = 'missed-after-ringing';
  jest
    .mocked(Notifications.getPresentedNotificationsAsync)
    .mockResolvedValue([remotePush(id, 'call')]);
  await showDeviceAlert(id, 'missed-call', 'Missed call', 'Contact');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('navigation while enumerating delivered notifications cancels a foreground banner', async () => {
  let current = true;
  jest.mocked(Notifications.getPresentedNotificationsAsync).mockImplementationOnce(async () => {
    current = false;
    return [];
  });
  await showForegroundDeviceAlert(
    'navigated-during-read',
    'message',
    'Preview',
    'Contact',
    () => current,
  );
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
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
