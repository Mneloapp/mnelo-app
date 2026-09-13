import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
// One clock per list updates date labels at local midnight and after returning to the app.
export function useDayBoundary() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const time = Date.now(),
        next = new Date(time);
      next.setHours(24, 0, 0, 0);
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        Math.max(1, next.getTime() - time),
      );
    };
    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(timer);
        setNow(Date.now());
        schedule();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  return now;
}
