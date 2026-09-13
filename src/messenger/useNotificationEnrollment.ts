import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppActive } from '@/hooks/useAppActive';
import { enableAlertsByDefault } from './device-alerts';
import { retryBackground, setBackgroundStatus } from './background-status';

/** OS authorization is the saved preference; there is no separate default-off switch. */
export function useNotificationEnrollment(authenticated: boolean, path: string) {
  const active = useAppActive();
  const cache = useQueryClient();
  const eligible =
    authenticated &&
    active &&
    !['/identity', '/phone', '/restore'].includes(path) &&
    !path.startsWith('/call/');
  useEffect(() => {
    if (!eligible) return;
    let current = true;
    void (async () => {
      const permission = await enableAlertsByDefault(() => current);
      if (!current) return;
      cache.setQueryData(['device', 'alert-permission'], permission);
      if (permission.allowed) await retryBackground();
    })().catch(() => {
      // Permission/registration errors are visible in Me > Notifications, without
      // covering the registration or conversation screen with an error banner.
      if (current) setBackgroundStatus('unavailable');
    });
    return () => {
      current = false;
    };
  }, [eligible, cache]);
}
