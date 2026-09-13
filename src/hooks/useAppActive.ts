import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
const subscribe = (listener: () => void) => {
  const subscription = AppState.addEventListener('change', listener);
  return () => subscription.remove();
};
export function useAppActive() {
  return useSyncExternalStore(
    subscribe,
    () => AppState.currentState === 'active',
    () => true,
  );
}
