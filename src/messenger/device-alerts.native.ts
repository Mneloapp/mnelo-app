import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AlertKind, AlertPermission } from './device-alerts';
import { alertKind } from './notification-policy';
const prefix = 'mnelo-local-';
const channelId = 'mnelo-private-alerts';
Notifications.setNotificationHandler({
  handleNotification: async () => {
    // Foreground presentation belongs to DeviceNotifications, which knows the
    // visible chat and local contact name. Also suppress delayed local alerts.
    if (AppState.currentState !== 'background')
      return {
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    return {
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});
export async function alertPermission(): Promise<AlertPermission> {
  const result = await Notifications.getPermissionsAsync();
  return {
    supported: true,
    allowed:
      result.granted || result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    canAsk: result.canAskAgain,
    undetermined: result.status === 'undetermined',
  };
}
async function ensureChannel() {
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Mnelo',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
}
let requesting: Promise<AlertPermission> | null = null;
export function requestAlerts(isCurrent = () => true): Promise<AlertPermission> {
  // App activation and the settings screen can overlap while the OS dialog is open.
  if (requesting) return requesting;
  requesting = (async () => {
    await ensureChannel();
    if (!isCurrent() || AppState.currentState !== 'active') return alertPermission();
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return alertPermission();
  })().finally(() => {
    requesting = null;
  });
  return requesting;
}
export async function enableAlertsByDefault(isCurrent: () => boolean) {
  const permission = await alertPermission();
  // Only a first request is automatic. Never undo denial/revocation or re-prompt
  // Android users merely because the OS would allow another request.
  if (
    permission.allowed ||
    !permission.undetermined ||
    !permission.canAsk ||
    !isCurrent() ||
    AppState.currentState !== 'active'
  )
    return permission;
  return requestAlerts(isCurrent);
}
export async function showDeviceAlert(id: string, kind: AlertKind, body: string, title = 'Mnelo') {
  if (!(await alertPermission()).allowed) return;
  await ensureChannel();
  // Local title/body follow the user's OS preview settings. Routing data remains
  // an opaque kind; no plaintext is transmitted to the push provider.
  await Notifications.scheduleNotificationAsync({
    identifier: prefix + id,
    content: { title, body, data: { kind }, sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId } : null,
  });
}
export async function dismissDeviceAlert(id: string) {
  await Notifications.dismissNotificationAsync(prefix + id);
}
export async function presentedAlertIds() {
  return (await Notifications.getPresentedNotificationsAsync())
    .map((n) => n.request.identifier)
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
}
export async function setDeviceBadge(count: number) {
  await Notifications.setBadgeCountAsync(count);
}
export function observeAlertTaps(listener: (kind: AlertKind, messageId?: string) => void) {
  const seen = new Set<string>();
  const consume = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const responseKey = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (seen.has(responseKey)) return;
    seen.add(responseKey);
    if (seen.size > 64) seen.delete(seen.values().next().value!);
    const remote = response.notification.request.content.data?.mnelo;
    if (remote && typeof remote === 'object' && 'kind' in remote && remote.kind === 'message') {
      listener('message', 'id' in remote && typeof remote.id === 'string' ? remote.id : undefined);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      return;
    }
    if (!response.notification.request.identifier.startsWith(prefix)) return;
    const kind = alertKind(response.notification.request.content.data);
    if (kind) listener(kind, response.notification.request.identifier.slice(prefix.length));
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(consume);
  consume(Notifications.getLastNotificationResponse());
  return () => subscription.remove();
}
