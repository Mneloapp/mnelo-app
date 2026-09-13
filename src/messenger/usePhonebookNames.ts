import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { DeviceMessenger } from './engine';
import { savedPhoneNames } from './phonebook';
import { observePhonebook } from './phonebook-events';

const empty: ReadonlyMap<string, string> = new Map();
export function usePhonebookNames(
  engine: DeviceMessenger | null,
  enabled: boolean,
  ownNumber?: string,
) {
  const [resolvedNames, setResolvedNames] = useState<{
    engine: DeviceMessenger | null;
    number: string | undefined;
    names: ReadonlyMap<string, string>;
  }>({ engine: null, number: undefined, names: empty });
  useEffect(() => {
    if (!engine || !enabled) return;
    let alive = true;
    let fingerprint = '';
    let force = true;
    let running = false;
    let queued = false;
    const update = async () => {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        do {
          queued = false;
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
            if (alive) {
              fingerprint = next;
              setResolvedNames((previous) =>
                previous.engine === engine &&
                previous.number === ownNumber &&
                previous.names.size === resolved.size &&
                [...resolved].every(([key, name]) => previous.names.get(key) === name)
                  ? previous
                  : { engine, number: ownNumber, names: resolved },
              );
            }
          }
        } while (alive && queued);
      } catch {
        // Permission changes/read failures clear the projection, never the saved alias.
        if (alive) {
          fingerprint = '';
          setResolvedNames({ engine, number: ownNumber, names: empty });
        }
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
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    void update();
    return () => {
      alive = false;
      changes();
      permission();
      foreground.remove();
    };
  }, [engine, enabled, ownNumber]);
  return enabled && resolvedNames.engine === engine && resolvedNames.number === ownNumber
    ? resolvedNames.names
    : empty;
}
