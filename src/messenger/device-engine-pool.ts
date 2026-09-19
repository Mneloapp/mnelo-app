import type { LocalDatabase } from './model';

type Session<T> = {
  promise: Promise<T>;
  users: number;
  retired: boolean;
  database?: LocalDatabase;
  value?: T;
  stop?: () => void;
};

// A suspended native connection is permanently invalid. Retire that entire
// engine generation; old work and old release callbacks must never reach the
// freshly reopened vault or decrement the new generation's lease count.
export class DeviceEnginePool<T> {
  private current: Session<T> | null = null;
  private closing = Promise.resolve();
  private recovery = false;
  private revision = 0;
  private listeners = new Set<() => void>();
  constructor(
    private readonly open: () => Promise<LocalDatabase>,
    private readonly initialize: (database: LocalDatabase) => Promise<T>,
    private readonly dispose: (value: T) => Promise<void>,
    private readonly suspended: (value: T | undefined) => void,
  ) {}
  snapshot = () => this.revision;
  needsForeground = () => {
    // Native expiration may have occurred while JavaScript was suspended, before
    // its event can be delivered. Check the poisoned token on foreground entry.
    if (this.current?.database?.isSuspended?.()) this.suspend(this.current);
    return this.recovery;
  };
  observe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private suspend(session: Session<T>) {
    if (session.retired) return;
    session.retired = true;
    session.stop?.();
    if (this.current !== session) return;
    this.current = null;
    const first = !this.recovery;
    this.recovery = true;
    // Native close waits for rollback/handle cleanup. Do not wait for unrelated
    // old JS work: its poisoned token can never access the next connection.
    this.closing = session.database?.close().catch(() => undefined) ?? Promise.resolve();
    this.suspended(session.value);
    void session.promise.then(this.dispose).catch(() => undefined);
    // Repeated open failures belong to the same recovery episode. The provider
    // owns bounded retries; publishing each failure would make it reopen in a
    // tight effect loop before the OS can grant foreground execution time.
    if (first) {
      this.revision++;
      this.listeners.forEach((listener) => listener());
    }
  }
  private create(): Session<T> {
    const session = { users: 0, retired: false } as Session<T>;
    session.promise = this.closing.then(async () => {
      try {
        const database = await this.open();
        session.database = database;
        if (database.observeSuspension)
          session.stop = database.observeSuspension(() => this.suspend(session));
        if (database.isSuspended?.()) {
          this.suspend(session);
          throw new Error('DATABASE_SUSPENDED');
        }
        const value = await this.initialize(database);
        session.value = value;
        if (session.retired || database.isSuspended?.()) {
          this.suspend(session);
          throw new Error('DATABASE_SUSPENDED');
        }
        this.recovery = false;
        return value;
      } catch (error) {
        const interrupted =
          (error instanceof Error && error.message === 'DATABASE_SUSPENDED') ||
          session.database?.isSuspended?.();
        if (interrupted) this.suspend(session);
        session.stop?.();
        await session.database?.close().catch(() => undefined);
        throw interrupted ? new Error('DATABASE_SUSPENDED') : error;
      }
    });
    return session;
  }
  async acquire() {
    const current = this.current ?? (this.current = this.create());
    current.users++;
    let value: T;
    try {
      value = await current.promise;
      if (current.retired) throw new Error('DATABASE_SUSPENDED');
    } catch (error) {
      current.users--;
      if (this.current === current) this.current = null;
      throw error;
    }
    let released = false;
    return {
      value,
      release: () => {
        if (released) return;
        released = true;
        current.users--;
        if (current.users !== 0 || this.current !== current) return;
        this.current = null;
        current.retired = true;
        current.stop?.();
        this.closing = this.dispose(value).catch(() => undefined);
      },
    };
  }
}
