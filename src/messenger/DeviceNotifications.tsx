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
  observeAlertTaps,
  presentedAlertIds,
  setDeviceBadge,
  showDeviceAlert,
} from './device-alerts';
import { shouldAlert } from './notification-policy';
import { useNotificationEnrollment } from './useNotificationEnrollment';
import { systemCallAudio } from './system-calls';

export function DeviceNotifications() {
  const { engine, calls, identity, authenticated } = useDevice();
  const { data: counts, dataUpdatedAt } = useAttentionCounts(authenticated);
  const path = usePathname();
  useNotificationEnrollment(authenticated && Boolean(identity), path);
  const currentPath = useRef(path);
  const { t } = useTranslation();
  const [banner, setBanner] = useState<(IncomingMessage & { path: string; name?: string }) | null>(
    null,
  );
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
    const unsubscribe = engine.subscribeIncoming((message) => {
      const foreground = AppState.currentState === 'active';
      if (!shouldAlert(foreground, currentPath.current, message.chat, message.type)) return;
      if (foreground) {
        setBanner({ ...message, path: currentPath.current });
        // Names stay inside the unlocked app; never copy them into push data.
        void engine
          .chat(message.chat)
          .then((chat) => {
            if (!current || AppState.currentState !== 'active') return;
            setBanner((value) =>
              value?.id === message.id ? { ...value, name: chat?.title ?? t('brand') } : value,
            );
          })
          .catch(() => undefined);
      } else
        void showDeviceAlert(
          message.id,
          message.type,
          t(
            message.type === 'message'
              ? 'messenger.notificationNewMessage'
              : 'messenger.callMissed',
          ),
        ).catch(() => setError(true));
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [engine, identity, authenticated, t]);
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
    if (!identity || !authenticated) return;
    return observeAlertTaps((kind) => {
      const call = calls?.snapshot();
      if (kind === 'incoming-call' && call?.status === 'incoming')
        router.push({ pathname: '/call/[id]', params: { id: call.chat } });
      else router.navigate(kind === 'message' ? '/(tabs)/chats' : '/(tabs)/calls');
    });
  }, [calls, identity, authenticated]);
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
            {t('messenger.notificationOpen')}
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
