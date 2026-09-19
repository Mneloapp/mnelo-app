import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { DeviceMessenger } from './engine';
import { observeNativePhonebook, savedPhoneNames } from './phonebook';
import { observePhonebook, phonebookChanged } from './phonebook-events';

const empty: ReadonlyMap<string, string> = new Map();
export const PHONEBOOK_INITIAL_WAIT_MS = 5000;

function initialRead() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

// This projection is memory-only and scoped to one engine/number/access session.
// A pending name query cannot keep an old session's names after cleanup.
function nameSource(scope: {
  engine: DeviceMessenger | null;
  enabled: boolean;
  ownNumber: string | undefined;
}) {
  let names = empty;
  let active = true;
  let initial = initialRead();
  if (!scope.engine || !scope.enabled) initial.finish();
  return {
    get names() {
      return names;
    },
    async readNames() {
      const requested = initial;
      await requested.promise;
      return active && requested === initial ? names : empty;
    },
    start() {
      // React can replay an effect's setup after cleanup in development.
      if (!active) initial = initialRead();
      active = true;
    },
    publish(next: ReadonlyMap<string, string>) {
      if (!active) return;
      names = next;
      initial.finish();
    },
    stop() {
      active = false;
      names = empty;
      initial.finish();
    },
  };
}

export function usePhonebookNames(
  engine: DeviceMessenger | null,
  enabled: boolean,
  ownNumber?: string,
) {
  const source = useMemo(
    () => nameSource({ engine, enabled, ownNumber }),
    [engine, enabled, ownNumber],
  );
  const [, changedNames] = useState(0);
  useEffect(() => {
    source.start();
    if (!engine || !enabled) {
      source.publish(empty);
      return () => source.stop();
    }
    let alive = true;
    let fingerprint = '';
    let force = true;
    let running = false;
    let queued = false;
    const publish = (resolved: ReadonlyMap<string, string>) => {
      clearTimeout(initialTimeout);
      const previous = source.names;
      const next =
        previous.size === resolved.size &&
        [...resolved].every(([key, name]) => previous.get(key) === name)
          ? previous
          : resolved;
      source.publish(next);
      if (next !== previous) changedNames((revision) => revision + 1);
    };
    // A failed or hung Contacts bridge must not strand chat queries. Normal
    // startup waits for the first names, while a late successful read still
    // refreshes the projection after this exceptional fallback.
    const initialTimeout = setTimeout(() => {
      if (alive) publish(empty);
    }, PHONEBOOK_INITIAL_WAIT_MS);
    const update = async () => {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        do {
          queued = false;
          try {
            const refresh = force;
            force = false;
            const contacts = (await engine.contacts()).filter((c) => c.phone && !c.blocked);
            const next = contacts
              .map((c) => `${c.key}:${c.phone}`)
              .sort()
              .join('|');
            if (refresh || next !== fingerprint) {
              const byNumber = await savedPhoneNames(
                contacts.map((c) => c.phone!),
                ownNumber,
              );
              const resolved = new Map(
                contacts.flatMap((c) => {
                  const name = byNumber.get(c.phone!);
                  return name ? [[c.key, name] as const] : [];
                }),
              );
              // A native/permission change during this scan invalidates it.
              // Keep initial readers pending until the queued fresh scan.
              if (alive && !force) {
                fingerprint = next;
                publish(resolved);
              }
            }
          } catch {
            // Permission changes/read failures clear the projection, never the saved alias.
            if (alive && !force) {
              fingerprint = '';
              publish(empty);
            }
          }
        } while (alive && queued);
      } finally {
        running = false;
      }
    };
    const refresh = () => {
      force = true;
      void update();
    };
    const changes = engine.subscribe(() => {
      void update();
    });
    const permission = observePhonebook(refresh);
    const nativeChanges = observeNativePhonebook(phonebookChanged);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    void update();
    return () => {
      alive = false;
      clearTimeout(initialTimeout);
      source.stop();
      changes();
      permission();
      nativeChanges();
      foreground.remove();
    };
  }, [engine, enabled, ownNumber, source]);
  const names = source.names;
  return useMemo(() => ({ names, readNames: source.readNames }), [names, source]);
}
