import { useEffect } from 'react';
import { onlineManager, focusManager, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/stores/session';
import { repository } from '@/services';
import { RepositoryError } from '@/services/repository';
import { messageOutbox } from '@/services/message-outbox';
import { useDeletionState } from '@/features/privacy/deletion-state';
import { usePendingMessages } from './pending-messages';
export function useMessageOutbox() {
  const actor = useSession((s) => s.session?.profile?.id);
  const deleting = useDeletionState((s) => s.pending);
  const cache = useQueryClient();
  useEffect(
    () =>
      useSession.subscribe((state, previous) => {
        const owner = previous.session?.userId;
        if (owner && owner !== state.session?.userId) {
          messageOutbox.stop();
          usePendingMessages.getState().clear();
          void messageOutbox
            .erase(owner)
            .catch(() => usePendingMessages.setState({ storageFailed: true }));
        }
      }),
    [],
  );
  useEffect(() => {
    if (!actor || deleting) return;
    let alive = true,
      initialized = false,
      opening = false,
      lastOpen = 0,
      lastFailure = 0,
      ticking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canSend = () =>
      alive &&
      onlineManager.isOnline() &&
      focusManager.isFocused() &&
      useSession.getState().session?.userId === actor &&
      !useDeletionState.getState().pending;
    const deliver = async () => {
      if (!canSend() || Date.now() - lastFailure < 10000) return;
      if (initialized && !messageOutbox.isReady()) {
        initialized = false;
        usePendingMessages.setState({ ready: false, storageFailed: true });
      }
      if (!initialized) {
        if (opening || Date.now() - lastOpen < 10000) return;
        opening = true;
        lastOpen = Date.now();
        try {
          const sessionId =
            repository().mode === 'preview'
              ? 'local-preview'
              : await repository().currentDeviceId();
          if (!alive || useSession.getState().session?.userId !== actor) return;
          await messageOutbox.open({ ownerId: actor, sessionId });
          if (!alive) return;
          initialized = true;
          usePendingMessages.setState({ ready: true, storageFailed: false });
        } catch {
          if (alive) usePendingMessages.setState({ ready: false, storageFailed: true });
        } finally {
          opening = false;
        }
      }
      if (!initialized || !canSend()) return;
      try {
        await messageOutbox.flush(
          async (message) => {
            if (!canSend()) throw new RepositoryError('OFFLINE');
            return repository().sendMessage({
              conversationId: message.conversationId,
              text: message.text,
              clientId: message.clientId,
              ...(message.replyTo ? { replyTo: message.replyTo } : {}),
            });
          },
          canSend,
          (sent) => {
            if (!alive) return;
            usePendingMessages.getState().put(sent);
            void cache.invalidateQueries({ queryKey: ['messages', sent.conversationId] });
            void cache.invalidateQueries({ queryKey: ['conversations'] });
          },
        );
        if (alive) usePendingMessages.setState({ storageFailed: false });
      } catch {
        lastFailure = Date.now();
        if (alive) usePendingMessages.setState({ storageFailed: true });
      }
    };
    const tick = async () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (ticking || !canSend()) return;
      ticking = true;
      try {
        await deliver();
      } finally {
        ticking = false;
        if (canSend()) {
          const delay =
            !initialized || !messageOutbox.isReady()
              ? Math.max(0, 10000 - (Date.now() - lastOpen))
              : messageOutbox.nextDelayMs();
          if (delay !== undefined)
            timer = setTimeout(
              () => void tick(),
              Math.max(delay, 10000 - (Date.now() - lastFailure)),
            );
        }
      }
    };
    const queue = usePendingMessages.subscribe((state, previous) => {
      if (state.items !== previous.items && !ticking) void tick();
    });
    void tick();
    const online = onlineManager.subscribe(() => void tick());
    const focus = focusManager.subscribe(() => void tick());
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      queue();
      online();
      focus();
      messageOutbox.stop();
      usePendingMessages.getState().clear();
    };
  }, [actor, deleting, cache]);
}
