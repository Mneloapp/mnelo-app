import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import {
  showDeviceAlert,
  requestAlerts,
  enableAlertsByDefault,
} from '@/messenger/device-alerts.native';
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  getExpoPushTokenAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));
type Permission = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
const granted = { granted: true, status: 'granted', canAskAgain: true } as Permission;
const undetermined = { granted: false, status: 'undetermined', canAskAgain: true } as Permission;
const originalState = AppState.currentState;
const originalPlatform = Platform.OS;
beforeEach(() => {
  AppState.currentState = 'active';
  jest.mocked(Notifications.getPermissionsAsync).mockReset().mockResolvedValue(granted);
  jest.mocked(Notifications.requestPermissionsAsync).mockClear();
});
afterEach(() => {
  AppState.currentState = originalState;
  Platform.OS = originalPlatform;
});
test('local alerts contain generic copy and a fixed event kind, with no remote token registration', async () => {
  await requestAlerts();
  await showDeviceAlert('development-message-id', 'message', 'New message');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: 'mnelo-local-development-message-id',
    content: { title: 'Mnelo', body: 'New message', data: { kind: 'message' }, sound: 'default' },
    trigger: null,
  });
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
});
test('notification permission denial cannot trigger scheduling or a surprise permission request', async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValueOnce({ granted: false, canAskAgain: false } as Awaited<
      ReturnType<typeof Notifications.getPermissionsAsync>
    >);
  await showDeviceAlert('development-message-id', 'message', 'New message');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('first enrollment asks once for alerts, sound and badge even when activation overlaps', async () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValueOnce(undetermined)
    .mockResolvedValueOnce(undetermined);
  const result = await Promise.all([
    enableAlertsByDefault(() => true),
    enableAlertsByDefault(() => true),
  ]);
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledWith({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  expect(result.every((permission) => permission.allowed)).toBe(true);
});
test.each([false, true])(
  'existing denial is preserved even when canAskAgain=%s',
  async (canAskAgain) => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain,
    } as Permission);
    expect((await enableAlertsByDefault(() => true)).allowed).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  },
);
test('existing approval and provisional permission do not prompt again', async () => {
  expect((await enableAlertsByDefault(() => true)).allowed).toBe(true);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({
    granted: false,
    status: 'granted',
    canAskAgain: true,
    ios: { status: 3 },
  } as Permission);
  expect((await enableAlertsByDefault(() => true)).allowed).toBe(true);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('leaving enrollment or backgrounding cannot open the first permission dialog', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(undetermined);
  await enableAlertsByDefault(() => false);
  AppState.currentState = 'background';
  await enableAlertsByDefault(() => true);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
test('Android creates its notification channel before the first permission request', async () => {
  Platform.OS = 'android';
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce(undetermined);
  await enableAlertsByDefault(() => true);
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'mnelo-private-alerts',
    expect.objectContaining({ importance: 4 }),
  );
  expect(
    jest.mocked(Notifications.setNotificationChannelAsync).mock.invocationCallOrder[0],
  ).toBeLessThan(jest.mocked(Notifications.requestPermissionsAsync).mock.invocationCallOrder[0]!);
});

test('approved local notification shows the resolved caller and text without registering remote plaintext', async () => {
  await showDeviceAlert('fixture-id', 'message', 'Hello from the encrypted vault', 'Friend ❤️');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: 'mnelo-local-fixture-id',
    content: {
      title: 'Friend ❤️',
      body: 'Hello from the encrypted vault',
      data: { kind: 'message' },
      sound: 'default',
    },
    trigger: null,
  });
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
});
