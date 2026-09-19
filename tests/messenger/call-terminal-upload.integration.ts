import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { DeviceMessenger } from '../../src/messenger/engine';
import { ApplicationDelivery } from '../../src/messenger/delivery/application';
import type { CallControl } from '../../src/messenger/calls';
import type { DeliveryEnvelope } from '../../src/messenger/delivery/schema';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(submit?: (wire: DeliveryEnvelope) => Promise<void>) {
  const storage = [deliveryDatabase(), deliveryDatabase()];
  const engines = storage.map((value) => new DeviceMessenger(value.db, randomBytes, randomUUID));
  for (const engine of engines) await engine.initialize();
  const roots = await Promise.all(
    engines.map((engine, index) => engine.createIdentity('Fixture ' + index)),
  );
  for (const [index, engine] of engines.entries())
    await engine.completePhoneEnrollment(
      {
        phone: '+1202555010' + index,
        service: 'https://fixture.invalid',
        testOnly: true,
        verifiedAt: Date.now(),
      },
      roots[index]!.key,
    );
  const service = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: () => true,
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  await engines[0]!.trustPhoneContact({
    key: roots[1]!.key,
    phone: '+12025550101',
    name: 'Fixture peer',
  });
  const apps = engines.map(
    (engine, index) =>
      new ApplicationDelivery(
        engine,
        {
          execute: async (command) => {
            if (command.action === 'delivery-submit' && index === 0)
              await submit?.(command.envelope);
            return { delivery: service.execute(roots[index]!.key, command) };
          },
        },
        new NodeSignal(),
        randomBytes,
        randomUUID,
        () => {},
        async () => null,
        Date.now,
        true,
      ),
  );
  const app = apps[0]!,
    receiver = apps[1]!;
  await receiver.initialize();
  const keys = await receiver.journal.initialize();
  service.directory.publish(roots[1]!.key, keys, receiver.journal.binding(keys));
  await app.start();
  await app.pump.tick();
  const control: CallControl = {
    type: 'call',
    id: randomUUID(),
    media: 'voice',
    action: 'decline',
  };
  return {
    app,
    receiver,
    service,
    control,
    peer: roots[1]!.key,
    own: roots[0]!,
    storage: storage[0]!,
    async close() {
      apps.forEach((value) => value.stop());
      await app.pump.tick();
      service.close();
      for (const engine of engines) await engine.close();
    },
  };
}

test('terminal confirmation waits for exact server-accepted ciphertext, not local enqueue, and replay uploads once', async () => {
  const started = deferred(),
    release = deferred();
  const wires: DeliveryEnvelope[] = [];
  const f = await fixture(async (wire) => {
    wires.push(wire);
    started.resolve();
    await release.promise;
  });
  try {
    assert.equal(await f.app.sendDurable(f.peer, f.control), true);
    let confirmed = false;
    const confirmation = f.app.waitForCallUpload(f.peer, f.control, 2000).then(() => {
      confirmed = true;
    });
    await started.promise;
    assert.equal(confirmed, false, 'sealing and starting HTTP do not confirm acceptance');
    assert.equal(f.service.store.fetch(f.peer).length, 0);
    assert.equal((await f.app.journal.pending()).length, 1);
    release.resolve();
    await confirmation;
    assert.equal(confirmed, true);
    assert.equal((await f.app.journal.pending()).length, 0);
    const accepted = f.service.store.fetch(f.peer);
    assert.equal(accepted.length, 1);
    assert.equal(
      accepted[0]!.notify,
      undefined,
      'terminal controls create no message/call notification',
    );
    const keys = await f.app.journal.initialize();
    const { oneTime: _oneTime, ...identity } = keys;
    await f.receiver.journal.pin({
      ...identity,
      owner: f.own.key,
      signature: f.app.journal.binding(keys),
    });
    await f.receiver.journal.receive(accepted[0]!);
    assert.deepEqual(JSON.parse((await f.receiver.journal.inbox())[0]!.body).packet, f.control);
    assert.equal(await f.app.sendDurable(f.peer, f.control), true);
    await f.app.waitForCallUpload(f.peer, f.control, 1000);
    assert.equal(
      wires.length,
      1,
      'replaying the native terminal preserves the existing event token',
    );
    await assert.rejects(
      f.app.waitForCallUpload('f'.repeat(64), f.control, 1000),
      /CALL_TERMINAL_NOT_QUEUED/,
    );
    await assert.rejects(
      f.app.waitForCallUpload(f.peer, { ...f.control, action: 'end' }, 1000),
      /CALL_TERMINAL_NOT_QUEUED/,
    );
    await assert.rejects(
      f.app.waitForCallUpload(f.peer, { ...f.control, action: 'invite' }),
      /CALL_TERMINAL_REQUIRED/,
    );
  } finally {
    release.resolve();
    await f.close();
  }
});

test('offline terminal confirmation rejects within its deadline and leaves the encrypted event available for retry', async () => {
  let offline = true;
  const wires: string[] = [];
  const f = await fixture(async (wire) => {
    wires.push(JSON.stringify(wire));
    if (offline) throw new Error('FIXTURE_OFFLINE');
  });
  try {
    await f.app.sendDurable(f.peer, f.control);
    await assert.rejects(f.app.waitForCallUpload(f.peer, f.control, 150), /CALL_UPLOAD_TIMEOUT/);
    assert.equal(f.service.store.fetch(f.peer).length, 0);
    assert.equal((await f.app.journal.pending()).length, 1);
    offline = false;
    // Advance only the existing durable retry deadline, never discard/reseal.
    f.storage.sql.prepare('UPDATE signal_retries SET next_at=0').run();
    await f.app.waitForCallUpload(f.peer, f.control, 2000);
    assert.equal(f.service.store.fetch(f.peer).length, 1);
    assert.equal(wires.length, 2);
    assert.equal(wires[0], wires[1], 'retry sends the same authenticated Signal envelope');
  } finally {
    await f.close();
  }
});

test('a stopped runtime cannot confirm an otherwise pending terminal', async () => {
  const f = await fixture();
  try {
    f.app.pump.stop();
    await f.app.sendDurable(f.peer, f.control);
    const confirmation = f.app.waitForCallUpload(f.peer, f.control, 1000);
    f.app.stop();
    await assert.rejects(confirmation, /DELIVERY_STOPPED/);
    assert.equal((await f.app.journal.pending()).length, 1);
    assert.equal(f.service.store.fetch(f.peer).length, 0);
  } finally {
    await f.close();
  }
});

test('a stalled vault read cannot retain the native assertion beyond the bounded deadline', async () => {
  const f = await fixture();
  const release = deferred();
  const originalRead = f.storage.db.all;
  let reads = 0;
  try {
    f.app.pump.stop();
    await f.app.sendDurable(f.peer, f.control);
    f.storage.db.all = async (query, ...args) => {
      if (query.startsWith('SELECT uploaded FROM signal_outbox')) {
        reads++;
        await release.promise;
      }
      return originalRead(query, ...args);
    };
    await assert.rejects(f.app.waitForCallUpload(f.peer, f.control, 30), /CALL_UPLOAD_TIMEOUT/);
    release.resolve();
    await f.app.journal.pending();
    assert.equal(reads, 1, 'a late read cannot restart the timed-out poll');
  } finally {
    release.resolve();
    f.storage.db.all = originalRead;
    await f.close();
  }
});
