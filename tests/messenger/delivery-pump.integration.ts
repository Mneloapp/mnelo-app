import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { DeliveryStore } from '../../identity/delivery-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { DeliveryService } from '../../identity/delivery-service';
import { fixtureSms } from '../../identity/verification';
import { startPhoneHttp } from '../../identity/http';
import { createKeys } from '../../src/messenger/crypto';
import { PhoneClient } from '../../src/messenger/phone-client';
import { SignalJournal } from '../../src/messenger/delivery/journal';
import { DeliveryPump, type DeliveryState } from '../../src/messenger/delivery/pump';
import type { LocalDatabase } from '../../src/messenger/model';
import { NodeSignal } from './node-signal';

function device(now = Date.now) {
  const sql = new DatabaseSync(':memory:'),
    root = createKeys(randomBytes);
  const db: LocalDatabase = {
    async exec(query) {
      sql.exec(query);
    },
    async run(query, ...args) {
      sql.prepare(query).run(...args);
    },
    async all<T>(query: string, ...args: import('../../src/messenger/model').SQLValue[]) {
      return sql.prepare(query).all(...args) as T[];
    },
    async close() {
      sql.close();
    },
  };
  let tail: Promise<unknown> = Promise.resolve();
  const journal = new SignalJournal(
    <T>(work: (db: LocalDatabase) => Promise<T>) => {
      const result = tail.then(async () => {
        sql.exec('BEGIN IMMEDIATE');
        try {
          const value = await work(db);
          sql.exec('COMMIT');
          return value;
        } catch (error) {
          sql.exec('ROLLBACK');
          throw error;
        }
      });
      tail = result.catch(() => undefined);
      return result;
    },
    new NodeSignal(),
    root,
    now,
  );
  return { root, journal, sql };
}

test('call controls overtake a receipt backlog at the next completed HTTP boundary and preserve call FIFO and receipt fairness', async () => {
  async function run(callPriority: number) {
    let clock = Date.now();
    const a = device(() => clock),
      b = device(() => clock);
    const delivery = new DeliveryService(
      new DeliveryStore(new DatabaseSync(':memory:'), {
        registered: () => true,
        canContact: () => true,
      }),
      new SignalDirectory(new DatabaseSync(':memory:')),
    );
    const receipts: string[] = Array.from({ length: 20 }, () => randomUUID());
    const calls: string[] = Array.from({ length: 9 }, () => randomUUID());
    const order: string[] = [];
    const uploadedAt = new Map<string, number>();
    let acceptedAt = 0;
    const pump = new DeliveryPump(
      {
        execute: async (command) => {
          clock += 160; // One signed challenge+command exchange, 80ms per request.
          const result = delivery.execute(a.root.key, command);
          if (
            command.action === 'delivery-submit' ||
            (command.action === 'delivery-sync' && command.envelope)
          ) {
            const id = command.envelope!.id;
            order.push(id);
            uploadedAt.set(id, clock);
            if (id === receipts[0]) {
              acceptedAt = clock;
              for (const call of calls)
                await a.journal.enqueue(
                  b.root.key,
                  call,
                  `CALL_${call}`,
                  clock,
                  undefined,
                  undefined,
                  callPriority,
                );
            }
          }
          return { delivery: result };
        },
      },
      a.journal,
      async () => ({}),
      () => {},
      () => clock,
      { outgoingOnly: true },
    );
    try {
      await a.journal.initialize();
      const keys = await b.journal.initialize();
      delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
      pump.start();
      await pump.tick();
      for (const receipt of receipts)
        await a.journal.enqueue(
          b.root.key,
          receipt,
          `RECEIPT_${receipt}`,
          clock,
          undefined,
          undefined,
          2,
        );
      for (let cycle = 0; cycle < 10 && order.length < receipts.length + calls.length; cycle++)
        await pump.tick();
      assert.equal(order.length, receipts.length + calls.length);
      assert.equal(
        new Set(order).size,
        order.length,
        'nested preemption never uploads the same ratchet event twice',
      );
      assert.deepEqual(
        order.filter((id) => calls.includes(id)),
        calls,
        'call accept/SDP/candidates remain FIFO',
      );
      if (callPriority === 3) {
        assert.deepEqual(order.slice(0, 6), [receipts[0], ...calls.slice(0, 4), receipts[1]]);
        assert.ok(
          order.indexOf(receipts[2]!) < order.indexOf(calls[8]!),
          'a long candidate burst keeps receipts moving',
        );
      }
      return {
        position: order.indexOf(calls[0]!) + 1,
        latency: uploadedAt.get(calls[0]!)! - acceptedAt,
      };
    } finally {
      pump.stop();
      delivery.close();
      a.sql.close();
      b.sql.close();
    }
  }
  const previousLane = await run(2),
    callLane = await run(3);
  assert.equal(previousLane.position, 21);
  assert.equal(callLane.position, 2);
  assert.equal(callLane.latency, 160);
  assert.equal(previousLane.latency, 3200);
  console.log(
    'CALL_BACKLOG_MODEL',
    JSON.stringify({ receipts: 20, signedExchangeMs: 160, previousLane, callLane }),
  );
});

test('accepting a call during an ongoing bulk upload sends its encrypted control before the remaining batch', async () => {
  const a = device(),
    b = device();
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  const first = randomUUID(),
    urgent = randomUUID();
  const order: string[] = [];
  const pump = new DeliveryPump(
    {
      execute: async (command, priority) => {
        const result = delivery.execute(a.root.key, command);
        if (
          command.action === 'delivery-submit' ||
          (command.action === 'delivery-sync' && command.envelope)
        ) {
          order.push(command.envelope!.id);
          if (command.envelope!.id === first)
            await a.journal.enqueue(
              b.root.key,
              urgent,
              'CALL_ACCEPT',
              Date.now(),
              undefined,
              undefined,
              2,
            );
          if (command.envelope!.id === urgent)
            assert.equal(priority, true, 'call keeps priority at the HTTP queue');
        }
        return { delivery: result };
      },
    },
    a.journal,
    async () => ({}),
    () => {},
  );
  try {
    await a.journal.initialize();
    const keys = await b.journal.initialize();
    delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
    for (const id of [first, randomUUID(), randomUUID(), randomUUID()])
      await a.journal.enqueue(b.root.key, id, `BULK_${id}`, Date.now());
    pump.start();
    await pump.tick();
    assert.deepEqual(order.slice(0, 2), [first, urgent]);
    assert.equal(new Set(order).size, order.length, 'preemption does not duplicate any upload');
    const aKeys = await a.journal.initialize();
    const { oneTime: _oneTime, ...identity } = aKeys;
    await b.journal.pin({ ...identity, owner: a.root.key, signature: a.journal.binding(aKeys) });
    const envelopes = delivery.store.fetch(b.root.key);
    for (const envelope of envelopes) await b.journal.receive(envelope);
    assert.ok(
      (await b.journal.inbox()).some((row) => row.body === 'CALL_ACCEPT'),
      'normal Signal decryption is preserved',
    );
  } finally {
    pump.stop();
    delivery.close();
    a.sql.close();
    b.sql.close();
  }
});

test('remote wake interrupts a bulk batch and fetches the inbox at urgent priority on the next serial cycle', async () => {
  const a = device(),
    b = device();
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  const order: string[] = [];
  let hinted = false;
  const pump = new DeliveryPump(
    {
      execute: async (command, urgent) => {
        const result = delivery.execute(a.root.key, command);
        if (
          command.action === 'delivery-inbox' ||
          (command.action === 'delivery-sync' && !command.envelope)
        )
          order.push(urgent ? 'urgent-inbox' : 'inbox');
        if (
          command.action === 'delivery-submit' ||
          (command.action === 'delivery-sync' && command.envelope)
        ) {
          order.push('upload');
          if (!hinted) {
            hinted = true;
            pump.receiveWake();
          }
        }
        return { delivery: result };
      },
    },
    a.journal,
    async () => ({}),
    () => {},
  );
  try {
    await a.journal.initialize();
    const keys = await b.journal.initialize();
    delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
    for (let n = 0; n < 4; n++) await a.journal.enqueue(b.root.key, randomUUID(), `BULK_${n}`);
    pump.start();
    await pump.tick();
    assert.deepEqual(order, ['upload', 'urgent-inbox', 'upload', 'upload', 'upload']);
    await pump.tick();
    assert.deepEqual(order, ['upload', 'urgent-inbox', 'upload', 'upload', 'upload', 'inbox']);
  } finally {
    pump.stop();
    delivery.close();
    a.sql.close();
    b.sql.close();
  }
});

test('an unready peer shares lookup backoff across a large backlog and restart, then recovers without discarding messages', async () => {
  let clock = Date.now();
  const a = device(() => clock),
    b = device(() => clock),
    c = device(() => clock);
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  let lookups = 0,
    submitted = 0;
  const client = {
    async execute(command: Parameters<PhoneClient['execute']>[0]) {
      if (command.action === 'delivery-identity' && command.peer === b.root.key) lookups++;
      if (
        (command.action === 'delivery-submit' || command.action === 'delivery-sync') &&
        command.envelope?.recipient === b.root.key
      )
        submitted++;
      return { delivery: delivery.execute(a.root.key, command) };
    },
  };
  const makePump = () =>
    new DeliveryPump(
      client,
      a.journal,
      async () => ({}),
      () => {},
      () => clock,
    );
  let pump = makePump();
  try {
    await a.journal.initialize();
    const cKeys = await c.journal.initialize();
    delivery.directory.publish(c.root.key, cKeys, c.journal.binding(cKeys));
    for (let i = 0; i < 111; i++)
      await a.journal.enqueue(b.root.key, randomUUID(), `QUEUED_${i}`, clock);
    await a.journal.enqueue(c.root.key, randomUUID(), 'OTHER_PEER', clock);
    pump.start();
    for (let i = 0; i < 25; i++) await pump.tick();
    assert.equal(lookups, 1, 'the backlog consumes one directory lookup');
    assert.equal(delivery.store.fetch(c.root.key).length, 1, 'another peer can still receive');
    assert.equal(
      a.sql.prepare('SELECT count(*) AS n FROM signal_outbox WHERE uploaded=0').get()?.n,
      111,
    );
    pump.stop();
    pump = makePump();
    pump.start();
    for (let i = 0; i < 25; i++) await pump.tick();
    assert.equal(lookups, 1, 'reopening does not bypass the saved peer delay');
    const bKeys = await b.journal.initialize();
    delivery.directory.publish(b.root.key, bKeys, b.journal.binding(bKeys));
    clock += 60000;
    for (let i = 0; i < 25; i++) await pump.tick();
    assert.equal(lookups, 2);
    assert.equal(submitted, 111, 'every queued event survives and is sent exactly once');
    assert.equal(
      a.sql.prepare('SELECT count(*) AS n FROM signal_outbox WHERE uploaded=0').get()?.n,
      0,
    );
    assert.equal(await a.journal.retry('identity', b.root.key, b.root.key), undefined);
  } finally {
    pump.stop();
    delivery.close();
    a.sql.close();
    b.sql.close();
    c.sql.close();
  }
});

test('two real Signal clients use authenticated HTTP delivery without a live sender, with durable reverse receipts and no repeated projection', async () => {
  let clock = Date.now();
  const a = device(() => clock),
    b = device(() => clock),
    statesA: DeliveryState[] = [],
    statesB: DeliveryState[] = [];
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  registry.bind(registry.index('+12025550101'), a.root.key, true, Date.now());
  registry.bind(registry.index('+12025550102'), b.root.key, true, Date.now());
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: (key) => Boolean(registry.status(key)),
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  const service = new PhoneService(
    registry,
    fixtureSms(true),
    Date.now,
    undefined,
    undefined,
    undefined,
    undefined,
    delivery,
  );
  const server = startPhoneHttp(service);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const received: string[] = [],
    receipts: string[] = [];
  const ap = new DeliveryPump(
    new PhoneClient(url, a.root),
    a.journal,
    async (sender, body) => {
      assert.equal(sender, b.root.key);
      receipts.push(body);
      return {};
    },
    (state) => statesA.push(state),
    () => clock,
  );
  const bp = new DeliveryPump(
    new PhoneClient(url, b.root),
    b.journal,
    async (sender, body) => {
      assert.equal(sender, a.root.key);
      if (body === 'FICTIONAL_INVALID_APP_PACKET') throw new Error('INVALID_APP_PACKET');
      received.push(body);
      return { receipt: { id: randomUUID(), body: 'FICTIONAL_DELIVERY_RECEIPT' } };
    },
    (state) => statesB.push(state),
  );
  try {
    ap.start();
    await ap.tick();
    const pendingId = randomUUID();
    await a.journal.enqueue(b.root.key, pendingId, 'FICTIONAL_OFFLINE_HTTP_MESSAGE');
    await ap.tick();
    assert.equal(statesA.at(-1), 'peer-not-ready');
    assert.equal(delivery.store.fetch(b.root.key).length, 0);
    assert.equal((await a.journal.pending())[0]?.id, pendingId);
    assert.equal(
      a.sql.prepare('SELECT wire FROM signal_outbox WHERE id=?').get(pendingId)?.wire,
      null,
    );
    bp.start();
    await bp.tick();
    clock += 60000;
    await ap.tick();
    assert.equal(statesA.at(-1), 'ready');
    assert.equal(statesB.at(-1), 'ready');
    await ap.tick();
    ap.stop();
    assert.equal(delivery.store.fetch(b.root.key).length, 1);
    await bp.tick();
    assert.deepEqual(received, ['FICTIONAL_OFFLINE_HTTP_MESSAGE']);
    assert.equal(delivery.store.fetch(b.root.key).length, 0);
    await bp.tick();
    assert.equal(received.length, 1);
    ap.start();
    await ap.tick();
    assert.deepEqual(receipts, ['FICTIONAL_DELIVERY_RECEIPT']);
    // Server cleanup is piggybacked on the next inbox exchange; local receipt
    // projection and sender-visible status already completed exactly once.
    await ap.tick();
    assert.equal(delivery.store.fetch(a.root.key).length, 0);
    assert.equal(statesA.at(-1), 'ready');
    assert.equal(statesB.at(-1), 'ready');
    // Neither a malformed ciphertext nor a decrypted but invalid application
    // packet may block a later valid message, disappear, or get a fake receipt.
    const now = Date.now(),
      poisoned = randomUUID();
    delivery.store.submit(a.root.key, {
      version: 2,
      id: poisoned,
      recipient: b.root.key,
      createdAt: now,
      type: 3,
      ciphertext: 'AA==',
    });
    await a.journal.enqueue(b.root.key, randomUUID(), 'FICTIONAL_INVALID_APP_PACKET');
    await a.journal.enqueue(b.root.key, randomUUID(), 'FICTIONAL_VALID_AFTER_BAD');
    await ap.tick();
    await bp.tick();
    assert.equal(statesB.at(-1), 'message-error');
    assert.ok(received.includes('FICTIONAL_VALID_AFTER_BAD'));
    assert.ok(!received.includes('FICTIONAL_INVALID_APP_PACKET'));
    await bp.tick();
    assert.equal(
      delivery.store.fetch(b.root.key).length,
      2,
      'failed items remain unacknowledged at the server',
    );
    const failures = b.sql
      .prepare('SELECT phase,code FROM signal_retries ORDER BY phase')
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(failures, [
      { phase: 'project', code: 'message-error' },
      { phase: 'receive', code: 'message-error' },
    ]);
    const delivered = received.length;
    await bp.tick();
    assert.equal(received.length, delivered);
    assert.equal(delivery.store.fetch(b.root.key).length, 2);
    bp.stop();
    const restarted = new DeliveryPump(
      new PhoneClient(url, b.root),
      b.journal,
      async () => {
        throw new Error('BACKOFF_WAS_LOST');
      },
      (state) => statesB.push(state),
    );
    try {
      restarted.start();
      await restarted.tick();
      assert.equal(statesB.at(-1), 'message-error');
      assert.deepEqual(
        b.sql
          .prepare('SELECT attempts FROM signal_retries')
          .all()
          .map((row) => row.attempts),
        [1, 1],
      );
    } finally {
      restarted.stop();
    }
    ap.stop();
    let unblock!: () => void,
      entered!: () => void,
      finished!: () => void,
      cycles = 0;
    const barrier = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const again = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const awakened = new DeliveryPump(
      new PhoneClient(url, a.root),
      a.journal,
      async () => ({}),
      () => {},
      Date.now,
      {
        beforeCycle: async () => {
          if (cycles === 0) {
            entered();
            await barrier;
          }
        },
        afterCycle: async () => {
          if (++cycles === 2) finished();
        },
      },
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      awakened.start();
      const active = awakened.tick();
      await started;
      awakened.wake();
      unblock();
      await active;
      await Promise.race([
        again,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('WAKE_DURING_TICK_LOST')), 1000);
        }),
      ]);
      assert.equal(cycles, 2);
    } finally {
      clearTimeout(timeout);
      awakened.stop();
    }
    const originalKeys = await b.journal.initialize();
    const high = Math.max(...originalKeys.oneTime.map((key) => key.id));
    while (delivery.directory.count(b.root.key) > 10) delivery.directory.take(b.root.key);
    const client = new PhoneClient(url, b.root);
    let losePublicationResponse = true;
    const maintenance = new DeliveryPump(
      {
        execute: async (command) => {
          const result = await client.execute(command);
          if (
            command.action === 'delivery-publish' &&
            command.keys.oneTime.some((key) => key.id > high) &&
            losePublicationResponse
          ) {
            losePublicationResponse = false;
            throw new Error('FIXTURE_PUBLICATION_RESPONSE_LOST');
          }
          return result;
        },
      },
      b.journal,
      async () => false,
      () => {},
    );
    try {
      maintenance.start();
      await maintenance.tick();
      assert.equal(losePublicationResponse, false);
      const afterLostResponse = await b.journal.initialize();
      assert.equal(afterLostResponse.identity, originalKeys.identity);
      assert.equal(delivery.directory.count(b.root.key), 50);
      await maintenance.tick();
      const retried = await b.journal.initialize();
      assert.deepEqual(
        retried,
        afterLostResponse,
        'lost publish response never replaces keys or allocates another batch',
      );
      assert.equal(
        delivery.directory.count(b.root.key),
        50,
        'leased keys are not re-published into the available pool',
      );
      for (const key of originalKeys.oneTime)
        assert.deepEqual(
          retried.oneTime.find((item) => item.id === key.id),
          key,
          'pending leased private keys remain usable',
        );
    } finally {
      maintenance.stop();
    }
  } finally {
    ap.stop();
    bp.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delivery.close();
    registry.close();
    a.sql.close();
    b.sql.close();
  }
});

test('call signaling is uploaded before maintenance or an old inbox backlog', async () => {
  const a = device(),
    b = device();
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  const urgent = randomUUID();
  let maintenance = 0;
  const uploads: string[] = [];
  const pump = new DeliveryPump(
    {
      execute: async (command) => {
        const result = delivery.execute(a.root.key, command);
        if ('envelope' in command && command.envelope) uploads.push(command.envelope.id);
        return { delivery: result };
      },
    },
    a.journal,
    async () => ({}),
    () => {},
    Date.now,
    {
      beforeCycle: async () => {
        maintenance++;
        assert.ok(
          delivery.store.fetch(b.root.key).some((envelope) => envelope.id === urgent),
          'urgent call bypasses maintenance',
        );
      },
    },
  );
  try {
    await a.journal.initialize();
    const keys = await b.journal.initialize();
    delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
    for (let i = 0; i < 20; i++)
      await a.journal.enqueue(b.root.key, randomUUID(), 'OLD_' + i, Date.now() - 300000);
    await a.journal.enqueue(
      b.root.key,
      randomUUID(),
      'RECEIPT',
      Date.now(),
      undefined,
      undefined,
      1,
    );
    await a.journal.enqueue(b.root.key, urgent, 'CALL_SIGNAL', Date.now(), undefined, undefined, 2);
    pump.start();
    await pump.tick();
    assert.equal(maintenance, 1);
    assert.equal(
      uploads[0],
      urgent,
      'call is submitted first even when server acceptance timestamps tie',
    );
    assert.ok((await a.journal.pending()).length > 0, 'bulk work remains durable');
  } finally {
    pump.stop();
    delivery.close();
    a.sql.close();
    b.sql.close();
  }
});

for (const outgoingOnly of [false, true])
  test(`legacy-server fallback and share isolation (outgoingOnly=${outgoingOnly})`, async () => {
    const a = device(),
      b = device();
    const delivery = new DeliveryService(
      new DeliveryStore(new DatabaseSync(':memory:'), {
        registered: () => true,
        canContact: () => true,
      }),
      new SignalDirectory(new DatabaseSync(':memory:')),
    );
    let attempts = 0,
      uploads = 0;
    const pump = new DeliveryPump(
      {
        execute: async (command) => {
          if (command.action === 'delivery-status' && command.capabilities) {
            attempts++;
            throw new Error('PHONE_REQUEST_FAILED');
          }
          assert.notEqual(command.action, 'delivery-sync');
          if (command.action === 'delivery-submit') uploads++;
          return { delivery: delivery.execute(a.root.key, command) };
        },
      },
      a.journal,
      async () => ({}),
      () => {},
      Date.now,
      { outgoingOnly },
    );
    try {
      const keys = await b.journal.initialize();
      delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
      await a.journal.initialize();
      await a.journal.enqueue(b.root.key, randomUUID(), 'LEGACY_COMPATIBILITY');
      pump.start();
      await pump.tick();
      await pump.tick();
      assert.equal(attempts, outgoingOnly ? 0 : 1);
      assert.equal(uploads, 1);
      assert.equal(delivery.store.fetch(b.root.key).length, 1);
    } finally {
      pump.stop();
      delivery.close();
      a.sql.close();
      b.sql.close();
    }
  });

test('full sync pages drain without three-second gaps and batch cleanup never drops poison ciphertext', async () => {
  const a = device(),
    b = device();
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  const client = (actor: string) => ({
    execute: async (command: Parameters<PhoneClient['execute']>[0]) => {
      const result = delivery.execute(actor, command);
      return { delivery: result };
    },
  });
  const received = new Set<string>();
  const ap = new DeliveryPump(
    client(a.root.key),
    a.journal,
    async () => ({}),
    () => {},
  );
  const bp = new DeliveryPump(
    client(b.root.key),
    b.journal,
    async (_sender, body) => {
      received.add(body);
      return {};
    },
    () => {},
  );
  try {
    const keys = await b.journal.initialize();
    delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
    await a.journal.initialize();
    for (let n = 0; n < 45; n++) await a.journal.enqueue(b.root.key, randomUUID(), 'PAGE_' + n);
    ap.start();
    for (let n = 0; n < 5; n++) await ap.tick();
    ap.stop();
    const poison = randomUUID();
    delivery.store.submit(a.root.key, {
      version: 2,
      id: poison,
      createdAt: Date.now(),
      recipient: b.root.key,
      type: 3,
      ciphertext: 'AAAA',
    });
    const started = Date.now();
    bp.start();
    while (received.size < 45) {
      assert.ok(
        Date.now() - started < 1500,
        'full inbox pages must not wait for the fallback poll: received=' + received.size,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // The next real sync persists the final bounded acknowledgement batch.
    await bp.tick();
    await bp.tick();
    assert.equal(received.size, 45);
    assert.deepEqual(
      delivery.store.fetch(b.root.key).map((row) => row.id),
      [poison],
    );
    assert.ok(await b.journal.retry('receive', a.root.key, poison));
  } finally {
    ap.stop();
    bp.stop();
    delivery.close();
    a.sql.close();
    b.sql.close();
  }
});

test('native call wakes send encrypted work with display timers paused and stop cancels queued starts', async (context) => {
  const a = device(),
    b = device();
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  let uploaded = 0;
  let ready!: () => void;
  let cycleReady = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const pump = new DeliveryPump(
    {
      execute: async (command) => {
        if (
          command.action === 'delivery-submit' ||
          (command.action === 'delivery-sync' && command.envelope)
        )
          uploaded++;
        return { delivery: delivery.execute(a.root.key, command) };
      },
    },
    a.journal,
    async () => ({}),
    (state) => {
      if (state === 'ready') ready();
    },
    Date.now,
    { outgoingOnly: true },
  );
  try {
    await a.journal.initialize();
    const keys = await b.journal.initialize();
    delivery.directory.publish(b.root.key, keys, b.journal.binding(keys));
    context.mock.timers.enable({ apis: ['setTimeout'] });
    pump.start();
    await cycleReady;
    const call = randomUUID();
    await a.journal.enqueue(
      b.root.key,
      call,
      'fixture accepted call',
      Date.now(),
      undefined,
      undefined,
      2,
    );
    cycleReady = new Promise<void>((resolve) => {
      ready = resolve;
    });
    pump.receiveWake();
    await cycleReady;
    assert.equal(uploaded, 1, 'No timer tick is needed to upload accepted-call signaling');
    pump.stop();
    pump.start();
    pump.stop();
    await Promise.resolve();
    assert.equal(uploaded, 1);
  } finally {
    pump.stop();
    context.mock.timers.reset();
    a.sql.close();
    b.sql.close();
  }
});
