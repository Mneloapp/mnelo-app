import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import {
  DeliveredCallControl,
  CALL_RING_WINDOW_MS,
} from '../../src/messenger/delivery/call-control';
import { deliveryDatabase } from './delivery-fixture';
import { createKeys } from '../../src/messenger/crypto';
import type { DeviceCall } from '../../src/messenger/calls';

test('an acknowledged invite survives application restart; original ring deadline and answered state survive locally', async () => {
  let now = 2_000_000_000_000;
  const db = deliveryDatabase(),
    engine = new DeviceMessenger(db.db, randomBytes, randomUUID, () => now),
    peer = createKeys(randomBytes);
  await engine.initialize();
  await engine.createIdentity('Development owner');
  await engine.trustContact({ key: peer.key, name: 'Development contact' });
  let live: DeviceCall | null = null;
  const windows: (number | undefined)[] = [];
  const calls = {
    snapshot: () => live,
    receive: async (_peer: string, _control: unknown, window?: number) => {
      windows.push(window);
    },
  };
  const control = { type: 'call', id: randomUUID(), action: 'invite', media: 'voice' } as const;
  try {
    await new DeliveredCallControl(engine, calls, () => now).receive(peer.key, control, {
      createdAt: now,
    });
    assert.deepEqual(windows, [60000]);
    now += 45000;
    await new DeliveredCallControl(engine, calls, () => now).recover();
    assert.deepEqual(windows, [60000, 15000], 'restart never extends ringing');
    now += 15000;
    await new DeliveredCallControl(engine, calls, () => now).recover();
    assert.equal(windows.length, 2);
    assert.equal((await engine.callHistory())[0]?.status, 'missed');
    await new DeliveredCallControl(engine, calls, () => now).recover();
    assert.equal((await engine.callHistory()).length, 1);
    const answered = { ...control, id: randomUUID() };
    const adapter = new DeliveredCallControl(engine, calls, () => now);
    await adapter.receive(peer.key, answered, { createdAt: now });
    live = {
      ...answered,
      peer: peer.key,
      chat: '',
      incoming: true,
      status: 'active',
      local: null,
      remote: null,
      muted: false,
      speaker: false,
      camera: false,
    };
    await adapter.track();
    await adapter.recover();
    assert.equal((await engine.callHistory()).length, 1, 'a current live call is left alone');
    live = null;
    await new DeliveredCallControl(engine, calls, () => now).recover();
    assert.equal(
      (await engine.callHistory())[0]?.status,
      'failed',
      'interrupted answered call is not marked missed',
    );
    assert.equal(db.sql.prepare('SELECT count(*) AS n FROM delivered_call_invites').get()?.n, 0);
  } finally {
    await engine.close();
  }
});

test('expired and cancelled queued call invitations create one missed entry without ringing, including after controller restart', async () => {
  let now = 2_000_000_000_000;
  const db = deliveryDatabase(),
    engine = new DeviceMessenger(db.db, randomBytes, randomUUID, () => now),
    peer = createKeys(randomBytes);
  await engine.initialize();
  await engine.createIdentity('Development owner');
  await engine.trustContact({ key: peer.key, name: 'Development contact' });
  let rings = 0;
  const calls = {
    receive: async () => {
      rings++;
    },
  };
  const delivery = new DeliveredCallControl(engine, calls, () => now);
  try {
    const control = { type: 'call', id: randomUUID(), action: 'invite', media: 'voice' } as const;
    await delivery.receive(peer.key, control, { createdAt: now - CALL_RING_WINDOW_MS });
    assert.equal(rings, 0);
    assert.equal((await engine.callHistory()).length, 1);
    await new DeliveredCallControl(engine, calls, () => now).receive(peer.key, control, {
      createdAt: now - CALL_RING_WINDOW_MS,
    });
    assert.equal((await engine.callHistory()).length, 1);
    const pending = { ...control, id: randomUUID() };
    await delivery.receive(peer.key, { ...pending, action: 'end' }, { createdAt: now });
    rings = 0;
    now += 10;
    await new DeliveredCallControl(engine, calls, () => now).receive(peer.key, pending, {
      createdAt: now - 20,
    });
    assert.equal(rings, 0);
    assert.equal((await engine.callHistory()).length, 2);
    await delivery.receive(peer.key, { ...control, id: randomUUID() }, { createdAt: now });
    assert.equal(rings, 1, 'a new, unexpired invitation still rings');
    await engine.block(peer.key, true);
    await delivery.receive(peer.key, { ...control, id: randomUUID() }, { createdAt: now });
    assert.equal(rings, 1, 'blocked callers cannot ring');
  } finally {
    await engine.close();
  }
});

test('group invitation recovery preserves its roster, remaining deadline and group history', async () => {
  let now = 2_000_000_000_000;
  const storage = deliveryDatabase(),
    engine = new DeviceMessenger(storage.db, randomBytes, randomUUID, () => now);
  await engine.initialize();
  const own = await engine.createIdentity('Fixture owner');
  const host = createKeys(randomBytes),
    other = createKeys(randomBytes);
  for (const peer of [host, other])
    await engine.trustContact({ key: peer.key, name: 'Fixture member' });
  const chat = await engine.createGroup('Fixture group', [host.key, other.key]);
  const group = { chat, host: host.key, participants: [host.key, own.key, other.key] };
  const packet = {
    type: 'call' as const,
    id: randomUUID(),
    action: 'invite' as const,
    media: 'video' as const,
    group,
  };
  const received: { control: unknown; window: number | undefined }[] = [];
  const calls = {
    receive: async (_peer: string, control: unknown, window?: number) => {
      received.push({ control, window });
    },
  };
  try {
    await new DeliveredCallControl(engine, calls, () => now).receive(host.key, packet, {
      createdAt: now,
    });
    now += 40000;
    await new DeliveredCallControl(engine, calls, () => now).recover();
    assert.deepEqual(received[1], { control: packet, window: 20000 });
    now += 20000;
    await new DeliveredCallControl(engine, calls, () => now).recover();
    assert.equal(received.length, 2);
    const history = await engine.callHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0]?.group, true);
    assert.equal(history[0]?.chatId, chat);
    assert.equal(history[0]?.status, 'missed');
  } finally {
    await engine.close();
  }
});
