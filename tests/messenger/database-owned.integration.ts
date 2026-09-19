import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openOwnedDatabase, type OwnedDatabaseBridge } from '../../src/messenger/database-owned';

function fixture() {
  const events = new Set<(event: { id: string }) => void>();
  const suspended = new Set<string>();
  const operations: { id: string; sql: string; values?: unknown[] }[] = [];
  const closed: string[] = [];
  let next = 0;
  let result: Record<string, unknown>[] = [];
  let failure: Error | undefined;
  const bridge: OwnedDatabaseBridge = {
    databaseOpen: async () => `generation-${++next}`,
    databaseIsSuspended: (id) => suspended.has(id),
    databaseExec: async (id, sql) => {
      operations.push({ id, sql });
      if (failure) throw failure;
    },
    databaseAll: async (id, sql, values) => {
      operations.push({ id, sql, values });
      if (failure) throw failure;
      return result;
    },
    databaseClose: async (id) => {
      closed.push(id);
    },
    addListener: (_event, listener) => {
      events.add(listener);
      return {
        remove: () => {
          events.delete(listener);
        },
      };
    },
  };
  return {
    bridge,
    operations,
    closed,
    events,
    rows: (value: Record<string, unknown>[]) => {
      result = value;
    },
    fail: (error: Error) => {
      failure = error;
    },
    expire(id: string, emit = true) {
      suspended.add(id);
      if (emit) events.forEach((listener) => listener({ id }));
    },
  };
}

test('opening normalizes native suspension before a token exists and preserves genuine open errors', async () => {
  const f = fixture();
  f.bridge.databaseOpen = async () => {
    throw new Error('Native call rejected: DATABASE_SUSPENDED');
  };
  await assert.rejects(openOwnedDatabase(f.bridge, 'fixture-only'), /^Error: DATABASE_SUSPENDED$/);
  assert.equal(f.events.size, 0);
  assert.deepEqual(f.closed, [], 'native initialization owns cleanup before returning a token');
  const failure = new Error('DEVICE_KEY_MISSING');
  f.bridge.databaseOpen = async () => {
    throw failure;
  };
  await assert.rejects(openOwnedDatabase(f.bridge, 'fixture-only'), (error) => error === failure);
});

test('owned bridge round-trips SQL parameter and result types, including zero-length blobs', async () => {
  const f = fixture();
  const db = await openOwnedDatabase(f.bridge, 'fixture-only');
  await db.run(
    'insert fixture',
    null,
    9007199254740991,
    -7,
    0.25,
    'ქართული\0text',
    new Uint8Array(),
    new Uint8Array([0, 128, 255]),
  );
  assert.deepEqual(f.operations[0]?.values, [
    null,
    9007199254740991,
    -7,
    0.25,
    'ქართული\0text',
    { __mneloBlob: '' },
    { __mneloBlob: 'AID/' },
  ]);
  f.rows([
    {
      missing: null,
      integer: 9007199254740991,
      fraction: 0.25,
      text: 'ქართული\0text',
      bytes: { __mneloBlob: 'AID/' },
      empty: { __mneloBlob: '' },
    },
  ]);
  assert.deepEqual(await db.all('select fixture'), [
    {
      missing: null,
      integer: 9007199254740991,
      fraction: 0.25,
      text: 'ქართული\0text',
      bytes: new Uint8Array([0, 128, 255]),
      empty: new Uint8Array(),
    },
  ]);
  await db.close();
});

test('native expiry notifies only matching generation once and rejects late commit before touching native SQL', async () => {
  const f = fixture();
  const first = await openOwnedDatabase(f.bridge, 'fixture-only');
  const second = await openOwnedDatabase(f.bridge, 'fixture-only');
  let notices = 0;
  first.observeSuspension!(() => notices++);
  await first.exec('BEGIN IMMEDIATE');
  f.expire('generation-1');
  f.expire('generation-1');
  assert.equal(notices, 1);
  assert.equal(first.isSuspended!(), true);
  assert.equal(second.isSuspended!(), false);
  await assert.rejects(first.exec('COMMIT'), /DATABASE_SUSPENDED/);
  await second.exec('SELECT 1');
  assert.deepEqual(f.operations, [
    { id: 'generation-1', sql: 'BEGIN IMMEDIATE' },
    { id: 'generation-2', sql: 'SELECT 1' },
  ]);
  await first.close();
  await second.close();
});

test('missed background event is visible through snapshot and first resumed operation', async () => {
  const f = fixture();
  const db = await openOwnedDatabase(f.bridge, 'fixture-only');
  let notices = 0;
  db.observeSuspension!(() => notices++);
  f.expire('generation-1', false);
  assert.equal(db.isSuspended!(), true);
  await assert.rejects(db.all('late read'), /DATABASE_SUSPENDED/);
  assert.equal(notices, 1);
  assert.equal(f.operations.length, 0);
  await db.close();
});

test('expiry crossing an in-flight native operation normalizes its error while ordinary SQL failures remain retryable', async () => {
  const f = fixture();
  const db = await openOwnedDatabase(f.bridge, 'fixture-only');
  f.fail(new Error('DATABASE_QUERY_FAILED'));
  await assert.rejects(db.run('invalid SQL'), /DATABASE_QUERY_FAILED/);
  assert.equal(db.isSuspended!(), false);
  f.fail(new Error('Native error: DATABASE_SUSPENDED'));
  let notices = 0;
  db.observeSuspension!(() => notices++);
  await assert.rejects(db.exec('COMMIT'), /^Error: DATABASE_SUSPENDED$/);
  assert.equal(db.isSuspended!(), true);
  assert.equal(notices, 1);
  await db.close();
});

test('close awaits native cleanup once and removes observers without resurrecting the expired generation', async () => {
  const f = fixture();
  const db = await openOwnedDatabase(f.bridge, 'fixture-only');
  let finish!: () => void;
  f.bridge.databaseClose = async (id) => {
    f.closed.push(id);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  };
  const closing = db.close();
  assert.equal(db.close(), closing);
  let completed = false;
  void closing.then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(f.events.size, 0);
  await assert.rejects(db.exec('late COMMIT'), /DATABASE_CLOSED/);
  finish();
  await closing;
  assert.deepEqual(f.closed, ['generation-1']);
});
