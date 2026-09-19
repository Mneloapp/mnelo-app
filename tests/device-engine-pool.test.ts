import { DeviceEnginePool } from '@/messenger/device-engine-pool';
import type { LocalDatabase } from '@/messenger/model';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function database() {
  let listener = () => {};
  let suspended = false;
  const db: LocalDatabase = {
    exec: jest.fn(),
    run: jest.fn(),
    all: jest.fn(),
    close: jest.fn(async () => {}),
    isSuspended: () => suspended,
    observeSuspension: (next) => {
      listener = next;
      return () => {
        listener = () => {};
      };
    },
  };
  return {
    db,
    expire: (emit = true) => {
      suspended = true;
      if (emit) listener();
    },
  };
}

test('engine leases share one connection and close only after the last release', async () => {
  const a = database(),
    value = { id: 1 };
  const open = jest.fn(async () => a.db),
    initialize = jest.fn(async () => value),
    dispose = jest.fn(async () => {});
  const pool = new DeviceEnginePool(open, initialize, dispose, jest.fn());
  const [first, second] = await Promise.all([pool.acquire(), pool.acquire()]);
  expect(first.value).toBe(second.value);
  expect(open).toHaveBeenCalledTimes(1);
  first.release();
  first.release();
  expect(dispose).not.toHaveBeenCalled();
  second.release();
  expect(dispose).toHaveBeenCalledWith(value);
});

test('expired engine retires once; old releases cannot close the recovered generation', async () => {
  const a = database(),
    b = database();
  const open = jest.fn().mockResolvedValueOnce(a.db).mockResolvedValueOnce(b.db);
  const dispose = jest.fn(async () => {}),
    suspended = jest.fn(),
    change = jest.fn();
  const pool = new DeviceEnginePool(open, async (db) => ({ db }), dispose, suspended);
  pool.observe(change);
  const first = await pool.acquire(),
    second = await pool.acquire();
  a.expire();
  a.expire();
  expect(pool.needsForeground()).toBe(true);
  expect(suspended).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenCalledTimes(1);
  expect(a.db.close).toHaveBeenCalledTimes(1);
  const fresh = await pool.acquire();
  expect(fresh.value.db).toBe(b.db);
  expect(pool.needsForeground()).toBe(false);
  expect(dispose).toHaveBeenCalledTimes(1);
  first.release();
  second.release();
  expect(dispose).toHaveBeenCalledTimes(1);
  fresh.release();
  expect(dispose).toHaveBeenCalledTimes(2);
});

test('foreground checks detect a missed native suspension event before reuse', async () => {
  const a = database();
  const pool = new DeviceEnginePool(
    async () => a.db,
    async () => 'old',
    async () => {},
    jest.fn(),
  );
  await pool.acquire();
  a.expire(false);
  expect(pool.snapshot()).toBe(0);
  expect(pool.needsForeground()).toBe(true);
  expect(pool.snapshot()).toBe(1);
});

test('recovery waits for native rollback/close, not indefinitely stalled old JavaScript', async () => {
  const a = database(),
    b = database(),
    nativeClose = deferred<void>(),
    oldDispose = deferred<void>();
  jest.mocked(a.db.close).mockReturnValue(nativeClose.promise);
  const open = jest.fn().mockResolvedValueOnce(a.db).mockResolvedValueOnce(b.db);
  const pool = new DeviceEnginePool(
    open,
    async (db) => db,
    async (db) => {
      if (db === a.db) await oldDispose.promise;
    },
    jest.fn(),
  );
  const old = await pool.acquire();
  a.expire();
  const pending = pool.acquire();
  await Promise.resolve();
  expect(open).toHaveBeenCalledTimes(1);
  nativeClose.resolve();
  const fresh = await pending;
  expect(fresh.value).toBe(b.db);
  old.release();
  fresh.release();
  oldDispose.resolve();
});

test('expiration during initialization rejects the old generation and permits a fresh vault open', async () => {
  const a = database(),
    b = database(),
    initialize = deferred<string>();
  const open = jest.fn().mockResolvedValueOnce(a.db).mockResolvedValueOnce(b.db);
  const pool = new DeviceEnginePool(
    open,
    async (db) => (db === a.db ? initialize.promise : 'fresh'),
    async () => {},
    jest.fn(),
  );
  const pending = pool.acquire();
  const rejected = expect(pending).rejects.toThrow('DATABASE_SUSPENDED');
  await Promise.resolve();
  await Promise.resolve();
  a.expire();
  initialize.resolve('old');
  await rejected;
  const fresh = await pool.acquire();
  expect(fresh.value).toBe('fresh');
  fresh.release();
});

test('suspension before open returns a token enters recovery once without repeated revision loops', async () => {
  const fresh = database();
  const open = jest
    .fn()
    .mockRejectedValueOnce(new Error('DATABASE_SUSPENDED'))
    .mockRejectedValueOnce(new Error('DATABASE_SUSPENDED'))
    .mockResolvedValueOnce(fresh.db);
  const changed = jest.fn();
  const pool = new DeviceEnginePool(
    open,
    async (db) => db,
    async () => {},
    jest.fn(),
  );
  pool.observe(changed);
  await expect(pool.acquire()).rejects.toThrow('DATABASE_SUSPENDED');
  expect(pool.needsForeground()).toBe(true);
  expect(changed).toHaveBeenCalledTimes(1);
  await expect(pool.acquire()).rejects.toThrow('DATABASE_SUSPENDED');
  expect(changed).toHaveBeenCalledTimes(1);
  const lease = await pool.acquire();
  expect(lease.value).toBe(fresh.db);
  expect(pool.needsForeground()).toBe(false);
  fresh.expire();
  expect(changed).toHaveBeenCalledTimes(2);
  lease.release();
});

test('genuine failure before open returns a token does not masquerade as suspension', async () => {
  const failure = new Error('DEVICE_KEY_MISSING');
  const pool = new DeviceEnginePool(
    async () => {
      throw failure;
    },
    async (db) => db,
    async () => {},
    jest.fn(),
  );
  await expect(pool.acquire()).rejects.toBe(failure);
  expect(pool.needsForeground()).toBe(false);
  expect(pool.snapshot()).toBe(0);
});
