import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/ui';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';
import { useAppActive } from '@/hooks/useAppActive';
import { useDevice } from './DeviceProvider';
import { useAttentionCounts } from './attention';
import { type IncomingMessage } from './engine';
import {
  dismissDeviceAlert,
  presentedAlertIds,
  setDeviceBadge,
  showDeviceAlert,
} from './device-alerts';
import { shouldAlert } from './notification-policy';
import { useNotificationEnrollment } from './useNotificationEnrollment';
import { systemCallAudio } from './system-calls';
import { localNotificationPreview } from './notification-presentation';
import { useNotificationNavigation } from './useNotificationNavigation';

export function DeviceNotifications() {
  const { engine, calls, identity, authenticated } = useDevice();
  const { data: counts, dataUpdatedAt } = useAttentionCounts(authenticated);
  const path = usePathname();
  useNotificationNavigation();
  useNotificationEnrollment(authenticated && Boolean(identity), path);
  const currentPath = useRef(path);
  const { t, i18n } = useTranslation();
  const [banner, setBanner] = useState<
    (IncomingMessage & { path: string; name?: string; body?: string }) | null
  >(null);
  const [error, setError] = useState(false);
  const active = useAppActive();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    currentPath.current = path;
  }, [path, active]);
  useEffect(() => {
    if (authenticated) return;
    void (async () => {
      await setDeviceBadge(0);
      for (const id of await presentedAlertIds()) await dismissDeviceAlert(id);
    })().catch(() => setError(true));
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
          const chat = await engine.chat(message.chat);
          if (
            !current ||
            sequence !== latest ||
            AppState.currentState !== 'active' ||
            currentPath.current !== arrivalPath
          )
            return;
          // Resolve the local preview before presenting once. A slow contact
          // lookup must not flash a generic banner or overwrite a newer message.
          setBanner({
            ...message,
            path: arrivalPath,
            name: preview?.title ?? chat?.title ?? t('brand'),
            ...(preview ? { body: preview.body } : {}),
          });
        })().catch(() => undefined);
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
        })().catch(() => setError(true));
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
        void dismissDeviceAlert('ring-' + ringing).catch(() => setError(true));
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
            .catch(() => setError(true));
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
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engine, calls, counts, dataUpdatedAt, active, authenticated]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', () => setBanner(null));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [banner]);
  const visibleBanner =
    banner && banner.path === path && shouldAlert(active, path, banner.chat, banner.type);
  if (!active || !identity || !authenticated || (!visibleBanner && !error)) return null;
  return (
    <View style={[styles.overlay, { top: insets.top + theme.spacing.sm }]}>
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <FocusPressable
          accessibilityRole="button"
          style={styles.content}
          onPress={() => {
            if (error) {
              setError(false);
              router.push('/notifications');
            } else if (banner) {
              const item = banner;
              setBanner(null);
              if (item.type === 'message')
                router.push({ pathname: '/chat/[id]', params: { id: item.chat } });
              else router.navigate('/(tabs)/calls');
            }
          }}
        >
          <AppText variant="bodyMedium">
            {!error && banner?.name
              ? banner.name
              : t(
                  error
                    ? 'messenger.notificationFailure'
                    : banner?.type === 'message'
                      ? 'messenger.notificationNewMessage'
                      : 'messenger.callMissed',
                )}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {banner?.body ?? t('messenger.notificationOpen')}
          </AppText>
        </FocusPressable>
        <IconButton
          icon="x"
          label={t('messenger.notificationDismiss')}
          onPress={() => {
            setBanner(null);
            setError(false);
          }}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    zIndex: 10,
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  banner: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.controlBorder,
    borderWidth: theme.controls.borderWidth,
    borderRadius: theme.radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  content: { flex: 1, minHeight: theme.controls.minTapTarget, justifyContent: 'center' },
});
