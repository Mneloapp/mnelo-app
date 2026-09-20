import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeliveryStore } from '../../identity/delivery-store';
import { DeliveryNotificationWorker } from '../../notifications/delivery-worker';
import { WakeRegistry } from '../../notifications/registry';
import { WakeService } from '../../notifications/service';
import type { PushDeliveryOptions } from '../../notifications/apns';
import type { WakeEvent } from '../../src/messenger/wake-protocol';
const a = 'a'.repeat(64),
  b = 'b'.repeat(64),
  access = { registered: (key: string) => [a, b].includes(key), canContact: () => true };
function envelope(now: number, notify: WakeEvent) {
  return {
    version: 2 as const,
    id: randomUUID(),
    recipient: b,
    createdAt: now,
    type: 3 as const,
    ciphertext: 'AA==',
    notify,
  };
}

test('a notification queued during provider delivery keeps its wake and a full page drains without idle gaps', async () => {
  const store = new DeliveryStore(new DatabaseSync(':memory:'), access);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const sent = new Map<string, number>();
  let first = true;
  const worker = new DeliveryNotificationWorker(store, {
    deliverQueued: async (_sender, _recipient, event) => {
      if (first) {
        first = false;
        entered();
        await blocked;
      }
      sent.set(event.id, Date.now());
      return true;
    },
  });
  try {
    store.submit(a, envelope(Date.now(), { kind: 'message', id: randomUUID() }));
    worker.start();
    const initial = worker.tick();
    await firstEntered;
    const pending = Array.from({ length: 25 }, () => randomUUID());
    for (const id of pending) store.submit(a, envelope(Date.now(), { kind: 'message', id }));
    worker.wakeNow();
    // Let the previous implementation's zero-delay wake run during the active
    // tick. Its finally clause used to overwrite that wake with an idle delay.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const resumed = Date.now();
    release();
    await initial;
    const deadline = resumed + 750;
    while (pending.some((id) => !sent.has(id)) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sent.size, 26, 'new work and the next bounded page must not wait a second each');
    assert.equal(store.notifications().length, 0);
    assert.equal(store.fetch(b).length, 20, 'push acceptance never consumes ciphertext');
  } finally {
    release();
    worker.stop();
    store.close();
  }
});

test('push intent survives restart/provider failure and is coupled atomically to its ciphertext, not to sender connectivity', async () => {
  let now = 2_000_000_000_000,
    fail = true;
  const dir = mkdtempSync(join(tmpdir(), 'mnelo-push-fixture-')),
    path = join(dir, 'queue.db');
  let store = new DeliveryStore(new DatabaseSync(path), access, () => now);
  const routes = new WakeRegistry(new DatabaseSync(':memory:'));
  routes.register(
    b,
    { platform: 'ios', channel: 'alert', environment: 'sandbox', token: 'f'.repeat(64) },
    now,
  );
  const sent: { event: WakeEvent; options: PushDeliveryOptions | undefined }[] = [];
  const wake = new WakeService(
    routes,
    {
      send: async (_route, event, options) => {
        if (fail) {
          fail = false;
          throw new Error('FIXTURE_PROVIDER_DOWN');
        }
        sent.push({ event, options });
        return { accepted: true };
      },
    },
    () => now,
    (from, to) => store.allowed(from, to),
  );
  let worker = new DeliveryNotificationWorker(store, wake, () => now);
  try {
    const wire = envelope(now, { kind: 'message', id: randomUUID() });
    store.submit(a, wire);
    store.submit(a, wire);
    assert.equal(store.notifications().length, 1);
    worker.start();
    await worker.tick();
    worker.stop();
    assert.equal(sent.length, 0);
    assert.equal(store.fetch(b).length, 1);
    store.close();
    store = new DeliveryStore(new DatabaseSync(path), access, () => now);
    now += 2000;
    worker = new DeliveryNotificationWorker(store, wake, () => now);
    worker.start();
    await worker.tick();
    worker.stop();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.event, wire.notify);
    assert.equal(sent[0]?.options?.expiresAt, wire.createdAt + 30 * 86400000);
    assert.equal(store.notifications().length, 0);
    assert.equal(
      store.fetch(b).length,
      1,
      'provider acceptance does not acknowledge a private message',
    );
    store.acknowledge(b, a, wire.id);
    assert.equal(store.fetch(b).length, 0);
  } finally {
    worker.stop();
    store.close();
    routes.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('undelivered call becomes a bounded missed-call alert instead of stale ringing; recipient ACK and blocks remove pending work', async () => {
  let now = 2_000_000_000_000;
  const store = new DeliveryStore(new DatabaseSync(':memory:'), access, () => now);
  const sent: { event: WakeEvent; options: PushDeliveryOptions }[] = [];
  const worker = new DeliveryNotificationWorker(
    store,
    {
      deliverQueued: async (_from, _to, event, options) => {
        sent.push({ event, options });
        return true;
      },
    },
    () => now,
  );
  try {
    const wire = envelope(now, { kind: 'call', id: randomUUID(), video: true });
    store.submit(a, wire);
    worker.start();
    await worker.tick();
    worker.stop();
    assert.equal(sent[0]?.event.kind, 'call');
    assert.equal(sent[0]?.options.expiresAt, now + 60000);
    now += 60000;
    worker.start();
    await worker.tick();
    worker.stop();
    assert.deepEqual(sent[1]?.event, { kind: 'message', id: wire.notify.id });
    assert.equal(sent[1]?.options.missedCall, true);
    assert.equal(sent.length, 2);
    assert.equal(store.notifications().length, 0);
    const answered = envelope(now, { kind: 'call', id: randomUUID(), video: false });
    store.submit(a, answered);
    worker.start();
    await worker.tick();
    worker.stop();
    store.acknowledge(b, a, answered.id);
    now += 60000;
    worker.start();
    await worker.tick();
    worker.stop();
    assert.equal(sent.length, 3, 'a phone that consumed the invite handles its own outcome');
    store.submit(a, envelope(now, { kind: 'message', id: randomUUID() }));
    store.block(b, a, true);
    worker.start();
    await worker.tick();
    worker.stop();
    assert.equal(sent.length, 3);
  } finally {
    worker.stop();
    store.close();
  }
});

test('missing notification permission/token can retry later without requiring a reciprocal contact capability', async () => {
  const now = Date.now(),
    routes = new WakeRegistry(new DatabaseSync(':memory:'));
  let pushes = 0;
  const wake = new WakeService(
    routes,
    {
      send: async () => {
        pushes++;
        return { accepted: true };
      },
    },
    () => now,
    () => true,
  );
  const event = { kind: 'message', id: randomUUID() } as const,
    options = { expiresAt: now + 10000 };
  try {
    assert.equal(await wake.deliverQueued(a, b, event, options), false);
    routes.register(
      b,
      { platform: 'ios', channel: 'alert', environment: 'sandbox', token: 'e'.repeat(64) },
      now,
    );
    assert.equal(await wake.deliverQueued(a, b, event, options), true);
    assert.equal(pushes, 1);
    const denied = new WakeService(
      routes,
      {
        send: async () => {
          throw new Error('MUST_NOT_SEND');
        },
      },
      () => now,
      () => false,
    );
    assert.equal(await denied.deliverQueued(a, b, event, options), false);
  } finally {
    routes.close();
  }
});

test('an invite acknowledged while an earlier notification batch is in flight cannot become a stale missed alert', async () => {
  let now = 2_000_000_000_000;
  const store = new DeliveryStore(new DatabaseSync(':memory:'), access, () => now);
  const sent: string[] = [];
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstBatch = new Promise<void>((resolve) => {
    started = resolve;
  });
  const worker = new DeliveryNotificationWorker(
    store,
    {
      deliverQueued: async (_from, _to, event) => {
        sent.push(event.id);
        if (sent.length === 4) started();
        await gate;
        return true;
      },
    },
    () => now,
  );
  try {
    for (let index = 0; index < 5; index++)
      store.submit(a, envelope(now, { kind: 'call', id: randomUUID(), video: false }));
    now += 60000;
    const waiting = store.notifications()[4]!;
    worker.start();
    const work = worker.tick();
    await firstBatch;
    // The phone handled this invite (answer/decline/local timeout), while the
    // server still holds an earlier snapshot of its notification job.
    store.acknowledge(b, a, waiting.id);
    release();
    await work;
    assert.equal(sent.length, 4);
    assert.equal(sent.includes(waiting.event.id), false);
    assert.equal(store.notifications().length, 0);
  } finally {
    release();
    worker.stop();
    store.close();
  }
});
