import { useEffect, useRef, useState } from 'react';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useAppActive } from '@/hooks/useAppActive';
import { useDevice } from './DeviceProvider';
import { observeAlertTaps, type AlertKind } from './device-alerts';
import { availableNotificationPreview } from './notification-preview';

type Destination = { kind: AlertKind; messageId?: string };

export function useNotificationNavigation() {
  const { engine, identity, authenticated, calls, mesh } = useDevice();
  const active = useAppActive();
  const path = usePathname();
  const ready = Boolean(useRootNavigationState()?.key);
  const [pending, setPending] = useState<Destination | null>(null);
  const latest = useRef<Destination | null>(null);
  const runtime = useRef({ calls, mesh });
  useEffect(() => {
    runtime.current = { calls, mesh };
  }, [calls, mesh]);

  // Capture once, independently of runtime/call initialization. The native
  // response may arrive before navigation, unlock or inbox projection is ready.
  useEffect(
    () =>
      observeAlertTaps((kind, messageId) => {
        const next = { kind, ...(messageId ? { messageId } : {}) };
        latest.current = next;
        setPending(next);
      }),
    [],
  );

  useEffect(() => {
    // The initial registration route performs its own redirect. Let it settle
    // before opening a chat so it cannot replace the notification destination.
    if (!pending || !authenticated || !identity || !active || !ready || path === '/') return;
    let current = true;
    let running = false;
    let again = false;
    const resolve = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          const preview =
            pending.kind === 'message' && pending.messageId
              ? await availableNotificationPreview(
                  engine.deliveryAtomic,
                  identity.key,
                  pending.messageId,
                )
              : null;
          if (!current || latest.current !== pending) return;
          // A notification is an opaque message ID, never a trusted chat URL.
          // Wait for verified local history instead of consuming it too early
          // and falling back to Chats while the app is still receiving it.
          if (pending.kind === 'message' && pending.messageId && !preview) continue;
          latest.current = null;
          setPending(null);
          const call = runtime.current.calls?.snapshot();
          if (preview) router.navigate({ pathname: '/chat/[id]', params: { id: preview.chat } });
          else if (pending.kind === 'incoming-call' && call?.status === 'incoming')
            router.navigate({ pathname: '/call/[id]', params: { id: call.chat } });
          else router.navigate(pending.kind === 'message' ? '/(tabs)/chats' : '/(tabs)/calls');
          return;
        } while (again && current);
      } catch {
        // A temporarily unavailable vault is retried on the next local update.
      } finally {
        running = false;
      }
    };
    const stop = engine.subscribe(() => void resolve());
    runtime.current.mesh?.deliveryWake?.();
    void resolve();
    return () => {
      current = false;
      stop();
    };
  }, [engine, identity, authenticated, active, ready, path, pending]);
}
