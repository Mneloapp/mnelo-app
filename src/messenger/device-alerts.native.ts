import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AlertKind, AlertPermission } from './device-alerts';
import { alertKind } from './notification-policy';
const prefix = 'mnelo-local-';
const channelId = 'mnelo-private-alerts';
const callReplyKind = 'call-reply';
const defaultAction = Notifications.DEFAULT_ACTION_IDENTIFIER ?? 'default';
const foregroundAlerts = new Map<string, { expires: number; current?: () => boolean }>();
// Remember OS-presented events across notification cleanup and inbox replay.
// A received-but-hidden foreground push is deliberately not evidence of display.
const presentedEvents = new Set<string>();
function rememberPresented(id: string, kind: AlertKind) {
  presentedEvents.add(`${kind}:${id}`);
  if (presentedEvents.size > 512) presentedEvents.delete(presentedEvents.values().next().value!);
}
const hiddenAlert = {
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
};

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
function alertEvent(request: Notifications.NotificationRequest) {
  const data = objectData(request.content.data);
  const trigger = objectData(request.trigger);
  const payload = trigger?.type === 'push' ? objectData(trigger.payload) : null;
  const remote = objectData(data?.mnelo) ?? objectData(payload?.mnelo);
  if (typeof remote?.id === 'string' && remote.id.length > 0 && remote.id.length <= 128) {
    if (remote.kind === 'message') return { id: remote.id, kind: 'message' as const };
    if (remote.kind === 'call') return { id: remote.id, kind: 'incoming-call' as const };
  }
  if (objectData(data?.mneloCall)?.kind === callReplyKind) return null;
  const kind = alertKind(data);
  if (request.identifier.startsWith(prefix) && kind)
    return { id: request.identifier.slice(prefix.length), kind };
  return null;
}
async function presentedNotifications() {
  const notifications = await Notifications.getPresentedNotificationsAsync();
  for (const notification of notifications) {
    const event = alertEvent(notification.request);
    if (event) rememberPresented(event.id, event.kind);
  }
  return notifications;
}
async function alreadyPresented(id: string, kind: AlertKind) {
  const key = `${kind}:${id}`;
  if (!presentedEvents.has(key)) await presentedNotifications();
  return presentedEvents.has(key);
}
Notifications.setNotificationHandler?.({
  handleNotification: async (notification) => {
    const local = foregroundAlerts.get(notification.request?.identifier);
    if (local) {
      const current = local.current;
      delete local.current; // A repeated callback cannot present the same alert twice.
      // Preview resolution happens before scheduling, outside Expo's three-
      // second handler deadline. Only this locally authorized banner can show
      // in foreground; a generic APNs wake must not produce a second banner.
      const visible =
        local.expires > Date.now() && AppState.currentState === 'active' && current?.();
      if (visible) {
        const event = alertEvent(notification.request);
        if (event) rememberPresented(event.id, event.kind);
      }
      return visible
        ? {
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }
        : hiddenAlert;
    }
    // Remote pushes and delayed background local alerts stay silent when the
    // app is active/inactive. Verified foreground messages schedule once above.
    if (AppState.currentState !== 'background') return hiddenAlert;
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
  if (await alreadyPresented(id, kind)) return;
  await ensureChannel();
  // Local title/body follow the user's OS preview settings. Routing data remains
  // an opaque kind; no plaintext is transmitted to the push provider.
  await Notifications.scheduleNotificationAsync({
    identifier: prefix + id,
    content: { title, body, data: { kind }, sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId } : null,
  });
}
export async function showForegroundDeviceAlert(
  id: string,
  kind: AlertKind,
  body: string,
  title: string,
  isCurrent: () => boolean,
) {
  const current = () => AppState.currentState === 'active' && isCurrent();
  if (!current() || !(await alertPermission()).allowed) return;
  await ensureChannel();
  if (!current() || (await alreadyPresented(id, kind)) || !current()) return;
  const now = Date.now();
  for (const [key, value] of foregroundAlerts)
    if (value.expires <= now) foregroundAlerts.delete(key);
  const identifier = prefix + id;
  if (foregroundAlerts.has(identifier)) return;
  if (foregroundAlerts.size >= 128) foregroundAlerts.delete(foregroundAlerts.keys().next().value!);
  foregroundAlerts.set(identifier, { expires: now + 60_000, current });
  try {
    // iOS owns banner styling, preview visibility and Focus/sound settings.
    // Opaque local ID routing uses the same verified-vault path as remote taps.
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, data: { kind }, sound: 'default' },
      trigger: Platform.OS === 'android' ? { channelId } : null,
    });
  } catch (error) {
    foregroundAlerts.delete(identifier);
    throw error;
  }
}
export async function dismissDeviceAlert(id: string) {
  const notifications = await presentedNotifications();
  const identifiers = new Set([
    prefix + id,
    ...notifications
      .filter((notification) => alertEvent(notification.request)?.id === id)
      .map((notification) => notification.request.identifier),
  ]);
  await Promise.all(
    [...identifiers].map((identifier) => Notifications.dismissNotificationAsync(identifier)),
  );
}
export async function presentedAlertIds() {
  return [
    ...new Set(
      (await presentedNotifications()).flatMap((notification) => {
        const event = alertEvent(notification.request);
        return event ? [event.id] : [];
      }),
    ),
  ];
}
export async function setDeviceBadge(count: number) {
  await Notifications.setBadgeCountAsync(count);
}
export function observeAlertTaps(listener: (kind: AlertKind, messageId?: string) => void) {
  const consume = (response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== defaultAction) return;
    const event = alertEvent(response.notification.request);
    if (event) {
      rememberPresented(event.id, event.kind);
      listener(event.kind, event.id);
    }
  };
  return addResponseListener(consume);
}
