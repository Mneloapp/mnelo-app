import { useDeletionState } from '@/features/privacy/deletion-state';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
export function useInbox() {
  const deleting = useDeletionState((s) => s.pending);
  const actor = useSession((s) => s.session?.profile?.id);
  const userId = deleting ? undefined : actor;
  const cache = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<'conversation' | 'request' | 'access'>();
    const unsubscribe = repository().subscribeInbox(userId, (kind) => {
      if (kind) pending.add(kind);
      else {
        pending.add('conversation');
        pending.add('request');
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (pending.has('access')) {
          pending.clear();
          void cache.resetQueries();
          return;
        }
        if (pending.has('conversation')) {
          void cache.invalidateQueries({ queryKey: ['conversations'] });
          void cache.invalidateQueries({ queryKey: ['conversation'] });
        }
        if (pending.has('request'))
          for (const key of [
            'requests',
            'connections',
            'relationship',
            'profile',
            'connection-details',
            'completed-connections',
          ])
            void cache.invalidateQueries({ queryKey: [key] });
        pending.clear();
      }, 150);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, cache]);
}
