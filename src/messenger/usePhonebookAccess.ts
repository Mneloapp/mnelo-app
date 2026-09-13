import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ensurePhonebookAccess, phonebookAccess } from './phonebook';
import { observePhonebook } from './phonebook-events';
import type { PhonebookAccess } from './phonebook-access';

export function usePhonebookAccess() {
  const [access, setAccess] = useState<PhonebookAccess>('unavailable');
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const refresh = () => {
      const requested = ++generation;
      void phonebookAccess()
        .then((value) => {
          if (alive && requested === generation) setAccess(value);
        })
        .catch(() => {
          if (alive && requested === generation) setAccess('unavailable');
        });
    };
    refresh();
    void ensurePhonebookAccess().then(refresh).catch(refresh);
    const changes = observePhonebook(refresh);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      changes();
      foreground.remove();
    };
  }, []);
  return access;
}
