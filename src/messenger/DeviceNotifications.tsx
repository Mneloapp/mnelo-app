import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAppActive } from '@/hooks/useAppActive';
import { useDevice } from './DeviceProvider';
import { useAttentionCounts } from './attention';
import {
  dismissDeviceAlert,
  presentedAlertIds,
  setDeviceBadge,
  showDeviceAlert,
  showForegroundDeviceAlert,
} from './device-alerts';
import { shouldAlert } from './notification-policy';
import { useNotificationEnrollment } from './useNotificationEnrollment';
import { systemCallAudio } from './system-calls';
import { localNotificationPreview } from './notification-presentation';
import { useNotificationNavigation } from './useNotificationNavigation';
import { setBackgroundStatus } from './background-status';

const alertFailed = () => setBackgroundStatus('unavailable');

export function DeviceNotifications() {
  const { engine, calls, identity, authenticated } = useDevice();
  const { data: counts, dataUpdatedAt } = useAttentionCounts(authenticated);
  const path = usePathname();
  useNotificationNavigation();
  useNotificationEnrollment(authenticated && Boolean(identity), path);
  const currentPath = useRef(path);
  const { t, i18n } = useTranslation();
  const active = useAppActive();
  useEffect(() => {
    currentPath.current = path;
  }, [path, active]);
  useEffect(() => {
    if (authenticated) return;
    void (async () => {
      await setDeviceBadge(0);
      for (const id of await presentedAlertIds()) await dismissDeviceAlert(id);
    })().catch(alertFailed);
  }, [identity, authenticated]);
  useEffect(() => {
    if (!identity || !authenticated) return;
    let current = true;
    let latest = 0;
    const unsubscribe = engine.subscribeIncoming((message) => {
      const foreground = AppState.currentState === 'active';
      if (!shouldAlert(foreground, currentPath.current, message.chat, message.type)) return;
      if (foreground) {
        const sequence = ++latest;
        const arrivalPath = currentPath.current;
        void (async () => {
          const preview =
            message.type === 'message'
              ? await localNotificationPreview(engine, message.id, i18n.language).catch(() => null)
              : null;
          const isCurrent = () =>
            current &&
            sequence === latest &&
            AppState.currentState === 'active' &&
            currentPath.current === arrivalPath &&
            shouldAlert(true, currentPath.current, message.chat, message.type);
          if (!isCurrent()) return;
          // Resolve once, then let the OS render its standard notification.
          // The native handler rechecks this guard if navigation/lock races
          // scheduling; a slow lookup cannot replace a newer message.
          await showForegroundDeviceAlert(
            message.id,
            message.type,
            preview?.body ??
              t(
                message.type === 'message'
                  ? 'messenger.notificationNewMessage'
                  : 'messenger.callMissed',
              ),
            preview?.title ?? t('brand'),
            isCurrent,
          );
        })().catch(alertFailed);
      } else
        void (async () => {
          const preview =
            message.type === 'message'
              ? await localNotificationPreview(engine, message.id, i18n.language).catch(() => null)
              : null;
          if (!current || AppState.currentState !== 'background') return;
          await showDeviceAlert(
            message.id,
            message.type,
            preview?.body ??
              t(
                message.type === 'message'
                  ? 'messenger.notificationNewMessage'
                  : 'messenger.callMissed',
              ),
            preview?.title,
          );
        })().catch(alertFailed);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [engine, identity, authenticated, t, i18n.language]);
  useEffect(() => {
    if (!calls || systemCallAudio()) return;
    let ringing: string | undefined;
    return calls.subscribe(() => {
      const call = calls.snapshot();
      if (ringing && (ringing !== call?.id || call.status !== 'incoming')) {
        void dismissDeviceAlert('ring-' + ringing).catch(alertFailed);
        ringing = undefined;
      }
      if (call?.status === 'incoming' && ringing !== call.id) {
        ringing = call.id;
        if (AppState.currentState !== 'active')
          void showDeviceAlert('ring-' + call.id, 'incoming-call', t('messenger.callIncoming'))
            .then(async () => {
              const latest = calls.snapshot();
              if (latest?.id !== call.id || latest.status !== 'incoming')
                await dismissDeviceAlert('ring-' + call.id);
            })
            .catch(alertFailed);
      }
    });
  }, [calls, t]);
  useEffect(() => {
    if (!authenticated || !counts) return;
    let cancelled = false;
    void (async () => {
      await setDeviceBadge(counts.messages + counts.calls);
      for (const id of await presentedAlertIds()) {
        if (cancelled) return;
        const ringing = calls?.snapshot();
        const pending = id.startsWith('ring-')
          ? ringing?.status === 'incoming' && id === 'ring-' + ringing.id
          : await engine.attentionPending(id);
        if (!pending) await dismissDeviceAlert(id);
      }
    })().catch(() => {
      if (!cancelled) alertFailed();
    });
    return () => {
      cancelled = true;
    };
  }, [engine, calls, counts, dataUpdatedAt, active, authenticated]);
  return null;
}
