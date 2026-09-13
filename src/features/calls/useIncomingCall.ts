import { useDeletionState } from '@/features/privacy/deletion-state';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
export function useIncomingCall() {
  const deleting = useDeletionState((s) => s.pending);
  const actor = useSession((s) => s.session?.profile?.id);
  const user = deleting ? undefined : actor,
    path = usePathname(),
    last = useRef<string | null>(null);
  const q = useQuery({
    queryKey: ['incoming-call', user],
    queryFn: () => repository().incomingCall(),
    enabled: Boolean(user),
    refetchInterval: 5000,
  });
  const { refetch } = q;
  useEffect(() => {
    if (!user) {
      last.current = null;
      return;
    }
    return repository().subscribeCalls(user, () => void refetch());
  }, [user, refetch]);
  useEffect(() => {
    if (
      q.data &&
      q.data !== last.current &&
      !path.startsWith('/call/') &&
      AppState.currentState === 'active'
    ) {
      last.current = q.data;
      router.push({ pathname: '/call/[id]', params: { id: q.data } });
    }
  }, [q.data, path]);
}
