import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { DeviceCall } from './calls';

export function useCallDuration(call: DeviceCall | null) {
  const [now, setNow] = useState(Date.now);
  const start = call?.connectedAt;
  const end = call?.endedAt;
  useEffect(() => {
    if (start === undefined || end !== undefined) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    const app = AppState.addEventListener('change', tick);
    return () => {
      clearInterval(interval);
      app.remove();
    };
  }, [start, end]);
  if (start === undefined) return null;
  const seconds = Math.max(0, Math.floor(((end ?? now) - start) / 1000));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
