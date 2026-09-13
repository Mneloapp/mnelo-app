import { useEffect, useState } from 'react';
import { repository } from '@/services';
import { useDeletionState } from './deletion-state';
export function useDeletionGate() {
  const pending = useDeletionState((s) => s.pending);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void repository()
      .pendingAccountDeletion()
      .then((value) => {
        if (alive) {
          useDeletionState.getState().setPending(value);
          setReady(true);
          setFailed(false);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { pending, ready, failed, retry: () => setAttempt((n) => n + 1) };
}
