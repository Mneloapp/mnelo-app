import type { Chat } from './model';

export const MAX_PINNED_CHATS = 8;
export type ChatPinStorage = {
  read(owner: string): Promise<string | null>;
  write(owner: string, value: string): Promise<void>;
};
export type ChatPinSnapshot = Readonly<{ ids: readonly string[]; ready: boolean }>;
const empty: ChatPinSnapshot = { ids: [], ready: false };
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 80 &&
  !/[\u0000-\u001f]/.test(value);

function readIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1) return [];
    if (!('ids' in data) || !Array.isArray(data.ids)) return [];
    return [...new Set(data.ids.filter(validId))].slice(0, MAX_PINNED_CHATS);
  } catch {
    return [];
  }
}

// Only identifiers are stored. Names, messages and contact numbers remain in the
// encrypted conversation database. Each account has its own serialized writes.
export function createChatPins(storage: ChatPinStorage) {
  const accounts = new Map<
    string,
    {
      snapshot: ChatPinSnapshot;
      restored?: Promise<void>;
      readFailed?: boolean;
      tail: Promise<void>;
    }
  >();
  const listeners = new Set<() => void>();
  function account(owner: string) {
    let entry = accounts.get(owner);
    if (!entry) {
      entry = { snapshot: empty, tail: Promise.resolve() };
      accounts.set(owner, entry);
    }
    return entry;
  }
  const notify = () => listeners.forEach((listener) => listener());
  function restore(owner: string) {
    const entry = account(owner);
    if (entry.readFailed) {
      entry.readFailed = false;
      delete entry.restored;
    }
    entry.restored ??= storage
      .read(owner)
      .then((value) => {
        entry.snapshot = { ids: readIds(value), ready: true };
      })
      .catch(() => {
        entry.readFailed = true;
        entry.snapshot = { ids: [], ready: true };
      })
      .then(notify);
    return entry.restored;
  }
  function update(owner: string, change: (ids: readonly string[]) => readonly string[]) {
    const entry = account(owner);
    const next = entry.tail.then(async () => {
      await restore(owner);
      if (entry.readFailed) throw new Error('CHAT_PINS_UNAVAILABLE');
      const ids = change(entry.snapshot.ids);
      if (ids === entry.snapshot.ids) return;
      await storage.write(owner, JSON.stringify({ version: 1, ids }));
      entry.snapshot = { ids, ready: true };
      notify();
    });
    entry.tail = next.catch(() => undefined);
    return next;
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: (owner: string | undefined) => (owner ? account(owner).snapshot : empty),
    restore,
    toggle(owner: string, id: string) {
      if (!validId(id)) return Promise.reject(new Error('INVALID_CHAT_PIN'));
      return update(owner, (ids) => {
        if (ids.includes(id)) return ids.filter((value) => value !== id);
        if (ids.length >= MAX_PINNED_CHATS) throw new Error('CHAT_PIN_LIMIT');
        return [...ids, id];
      });
    },
    remove(owner: string, ids: readonly string[]) {
      const missing = new Set(ids);
      return update(owner, (current) =>
        current.some((id) => missing.has(id)) ? current.filter((id) => !missing.has(id)) : current,
      );
    },
  };
}

export function separatePinnedChats(rows: readonly Chat[], pinned: readonly Chat[]) {
  const pinnedIds = new Set(pinned.map((chat) => chat.id));
  return rows.filter((chat) => !pinnedIds.has(chat.id));
}
