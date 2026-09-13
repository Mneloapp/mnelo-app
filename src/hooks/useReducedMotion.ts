import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
export function useReducedMotion() {
  // No motion until the OS preference is known; observe later preference changes.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true,
      observed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      observed = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !observed) setReduced(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
