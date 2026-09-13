import { useDeletionState } from '@/features/privacy/deletion-state';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { RegistrationStatus } from './registration';
import { notificationId } from './payload';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
// Realtime already updates foreground screens. Never show private text in system notifications.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});
export async function registerNotifications(
  requestPermission: boolean,
): Promise<RegistrationStatus> {
  if (typeof projectId !== 'string') return 'buildRequired';
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('mnelo-updates', {
      name: 'Mnelo',
      importance: Notifications.AndroidImportance.HIGH,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (requestPermission && permission.status !== 'granted' && permission.canAskAgain)
    permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    await repository().disablePush();
    return permission.canAskAgain ? 'disabled' : 'denied';
  }
  const actor = useSession.getState().session?.userId;
  if (!actor) return 'disabled';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (useSession.getState().session?.userId !== actor) return 'disabled';
  const device = await repository().registerDevice({
    name: Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    osVersion: Device.osVersion ?? '',
  });
  if (useSession.getState().session?.userId !== actor) return 'disabled';
  await repository().registerPush(device, token);
  return 'enabled';
}
export function usePushEvents() {
  const deleting = useDeletionState((s) => s.pending);
  const actor = useSession((s) => s.session?.profile?.id);
  const userId = deleting ? undefined : actor;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let handling = false;
    const handle = async (response: Notifications.NotificationResponse | null) => {
      if (
        !response ||
        handling ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      )
        return;
      const id = notificationId(response.notification.request.content.data);
      if (!id) {
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }
      handling = true;
      try {
        const destination = await repository().resolveNotification(id);
        if (!alive || useSession.getState().session?.userId !== userId || !destination) return;
        switch (destination.event) {
          case 'message':
            router.push({ pathname: '/chat/[id]', params: { id: destination.target } });
            break;
          case 'request':
          case 'accepted':
            router.push('/requests');
            break;
          case 'match':
            router.push({ pathname: '/results/[id]', params: { id: destination.target } });
            break;
          case 'call':
            router.push({ pathname: '/call/[id]', params: { id: destination.target } });
            break;
        }
      } catch {
        /* A revoked or unavailable destination must not open cached private content. */
      } finally {
        handling = false;
        await Notifications.clearLastNotificationResponseAsync();
      }
    };
    void Notifications.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => undefined);
    const responses = Notifications.addNotificationResponseReceivedListener(
      (response) => void handle(response),
    );
    let lastRefresh = 0;
    const refresh = (force = false) => {
      if (!force && Date.now() - lastRefresh < 300000) return;
      lastRefresh = Date.now();
      void registerNotifications(false).catch(() => undefined);
    };
    refresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const tokens = Notifications.addPushTokenListener(() => refresh(true));
    return () => {
      alive = false;
      responses.remove();
      appState.remove();
      tokens.remove();
    };
  }, [userId]);
}
