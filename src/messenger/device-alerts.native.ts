import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AlertKind, AlertPermission } from './device-alerts';
import { alertKind } from './notification-policy';
const prefix = 'mnelo-local-';
const channelId = 'mnelo-private-alerts';
const callReplyAction = 'MNELO_CALL_REPLY';
const callReplyKind = 'call-reply';
const defaultAction = Notifications.DEFAULT_ACTION_IDENTIFIER ?? 'default';

type ResponseListener = (response: Notifications.NotificationResponse) => void;
let responseSubscription: { remove(): void } | null = null;
const responseListeners = new Set<ResponseListener>();
const seenResponses = new Set<string>();
let lastResponse: Notifications.NotificationResponse | null = null;
let lastResponseAt = 0;
function responseKey(response: Notifications.NotificationResponse) {
  return `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
}
function observeResponses() {
  if (responseSubscription) return;
  if (typeof Notifications.addNotificationResponseReceivedListener !== 'function') return;
  responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const key = responseKey(response);
    if (seenResponses.has(key)) return;
    seenResponses.add(key);
    lastResponse = response;
    lastResponseAt = Date.now();
    if (seenResponses.size > 128) seenResponses.delete(seenResponses.values().next().value!);
    responseListeners.forEach((listener) => listener(response));
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  });
  const getLast =
    (
      Notifications as typeof Notifications & {
        getLastNotificationResponseAsync?: () => Promise<Notifications.NotificationResponse | null>;
      }
    ).getLastNotificationResponseAsync ??
    (() => Promise.resolve(Notifications.getLastNotificationResponse()));
  void getLast()
    .then((response) => {
      if (!response) return;
      const key = responseKey(response);
      if (seenResponses.has(key)) return;
      seenResponses.add(key);
      lastResponse = response;
      lastResponseAt = Date.now();
      if (seenResponses.size > 128) seenResponses.delete(seenResponses.values().next().value!);
      responseListeners.forEach((listener) => listener(response));
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    })
    .catch(() => undefined);
}
function addResponseListener(listener: ResponseListener) {
  responseListeners.add(listener);
  observeResponses();
  // The app may register a second consumer just after iOS delivered the
  // response (for example, a cold-start call reply). Replay that response to
  // the late consumer for a short window so routing is not lost during boot.
  if (lastResponse && Date.now() - lastResponseAt < 10000) {
    const response = lastResponse;
    queueMicrotask(() => {
      if (responseListeners.has(listener)) listener(response);
    });
  }
  return () => responseListeners.delete(listener);
}
function objectData(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
Notifications.setNotificationHandler?.({
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
  const consume = (response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== defaultAction) return;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const remote = objectData(data?.mnelo);
    if (remote?.kind === 'message' && typeof remote.id === 'string') {
      listener('message', remote.id);
      return;
    }
    if (remote?.kind === 'call' && typeof remote.id === 'string') {
      listener('incoming-call', remote.id);
      return;
    }
    if (objectData(data?.mneloCall)?.kind === callReplyKind) return;
    if (!response.notification.request.identifier.startsWith(prefix)) return;
    const kind = alertKind(data);
    if (kind) listener(kind, response.notification.request.identifier.slice(prefix.length));
  };
  return addResponseListener(consume);
}

// CallKit cannot add an application-specific reply action to its full-screen
// sheet. The native call module posts a notification with a text-input action;
// this listener carries that action back to the durable call runtime when the
// app is launched from the lock screen.
export function observeCallReplies(listener: (id: string, text: string) => void) {
  const consume = (response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== callReplyAction) return;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const call = objectData(data?.mneloCall);
    const id = call?.id;
    const text = response.userText;
    if (call?.kind === callReplyKind && typeof id === 'string' && typeof text === 'string')
      listener(id, text);
  };
  return addResponseListener(consume);
}
