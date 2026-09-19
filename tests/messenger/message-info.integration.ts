import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import { ContactView } from '../../src/messenger/contact-view';
import { createKeys } from '../../src/messenger/crypto';
import { deliveryDatabase } from './delivery-fixture';

async function fixture(signal = true) {
  let clock = 10000;
  const storage = deliveryDatabase();
  const engine = new DeviceMessenger(storage.db, randomBytes, randomUUID, () => clock);
  await engine.initialize();
  const own = await engine.createIdentity('Sender');
  if (signal) await engine.enableSignalDelivery();
  const peers = ['B', 'C', 'D'].map((name) => ({ key: createKeys(randomBytes).key, name }));
  for (const peer of peers) await engine.trustContact(peer);
  return {
    storage,
    engine,
    own,
    peers,
    at: (value: number) => {
      clock = value;
    },
    close: () => engine.close(),
  };
}

test('message info exposes only own exact-chat messages and first locally observed authenticated ACK/read times', async () => {
  const f = await fixture();
  try {
    const [b, c] = f.peers;
    const chat = await f.engine.trustContact(b!),
      other = await f.engine.trustContact(c!);
    const id = await f.engine.send(chat, 'Message preview', { deferDelivery: true });
    const initial = await f.engine.messageInfo(chat, id);
    assert.equal(initial?.message.body, 'Message preview');
    assert.equal(initial?.message.status, 'pending');
    assert.deepEqual(initial?.recipients, [
      { peer: b!.key, name: b!.name, status: 'pending', deliveredAt: null, readAt: null },
    ]);
    assert.equal(await f.engine.messageInfo(other, id), null);
    assert.equal(await f.engine.messageInfo(chat, randomUUID()), null);
    f.at(11000);
    await f.engine.receive(c!.key, { type: 'ack', id });
    assert.equal(
      (await f.engine.messageInfo(chat, id))?.recipients[0]?.deliveredAt,
      null,
      'another trusted contact cannot acknowledge this delivery',
    );
    f.at(12000);
    await f.engine.receive(b!.key, { type: 'ack', id });
    f.at(13000);
    await f.engine.receive(b!.key, { type: 'ack', id });
    const delivered = await f.engine.messageInfo(chat, id);
    assert.equal(delivered?.recipients[0]?.deliveredAt, 12000);
    assert.equal(delivered?.recipients[0]?.status, 'delivered');
    f.at(14000);
    await f.engine.receive(b!.key, { type: 'read_ids', chat, ids: [id] });
    f.at(15000);
    await f.engine.receive(b!.key, { type: 'read_ids', chat, ids: [id] });
    const read = await new ContactView(f.engine, new Map([[b!.key, 'Local alias']])).messageInfo(
      chat,
      id,
    );
    assert.deepEqual(read?.recipients, [
      { peer: b!.key, name: 'Local alias', status: 'read', deliveredAt: 12000, readAt: 14000 },
    ]);
    assert.equal(read?.message.status, 'read');
    const incoming = randomUUID();
    await f.engine.receive(
      b!.key,
      {
        type: 'message',
        id: incoming,
        chat,
        sentAt: 15000,
        kind: 'text',
        body: 'Incoming',
        replyTo: null,
        media: null,
      },
      { sendReceipts: false },
    );
    assert.equal(await f.engine.messageInfo(chat, incoming), null);
    await f.engine.deleteLocalMessage(id);
    assert.equal(await f.engine.messageInfo(chat, id), null);
    assert.equal(
      f.storage.sql.prepare('SELECT count(*) AS count FROM message_receipt_info').get()!.count,
      0,
    );
  } finally {
    await f.close();
  }
});

test('read before ACK and historical delivered rows never acquire invented delivery times or lose read state', async () => {
  const f = await fixture();
  try {
    const b = f.peers[0]!,
      chat = await f.engine.trustContact(b);
    const id = await f.engine.send(chat, 'Read arrives first', { deferDelivery: true });
    f.at(20000);
    await f.engine.receive(b.key, { type: 'read', chat, through: id });
    f.at(21000);
    await f.engine.receive(b.key, { type: 'ack', id });
    assert.deepEqual((await f.engine.messageInfo(chat, id))?.recipients, [
      { peer: b.key, name: b.name, status: 'read', deliveredAt: null, readAt: 20000 },
    ]);
    const historical = await f.engine.send(chat, 'Old release delivered this', {
      deferDelivery: true,
    });
    f.storage.sql
      .prepare('UPDATE deliveries SET acknowledged=1 WHERE message_id=?')
      .run(historical);
    f.at(22000);
    await f.engine.receive(b.key, { type: 'ack', id: historical });
    assert.deepEqual((await f.engine.messageInfo(chat, historical))?.recipients, [
      { peer: b.key, name: b.name, status: 'delivered', deliveredAt: null, readAt: null },
    ]);
    assert.equal(f.storage.sql.prepare('PRAGMA user_version').get()!.user_version, 6);
  } finally {
    await f.close();
  }
});

test('group info uses original delivery recipients after membership changes and separates each recipient receipt', async () => {
  const f = await fixture();
  try {
    const [b, c, d] = f.peers;
    const chat = await f.engine.createGroup('Group', [b!.key, c!.key]);
    const id = await f.engine.send(chat, 'Original group audience', { deferDelivery: true });
    await f.engine.updateGroup(chat, 'Changed group', [b!.key, d!.key]);
    f.at(30000);
    await f.engine.receive(b!.key, { type: 'ack', id });
    f.at(31000);
    await f.engine.receive(c!.key, { type: 'read_ids', chat, ids: [id] });
    f.at(32000);
    await f.engine.receive(d!.key, { type: 'ack', id });
    assert.equal(await f.engine.receive(d!.key, { type: 'read_ids', chat, ids: [id] }), false);
    const info = await f.engine.messageInfo(chat, id);
    assert.equal(info?.kind, 'group');
    assert.deepEqual(info?.recipients.map((row) => row.peer).sort(), [b!.key, c!.key].sort());
    assert.equal(info?.recipients.find((row) => row.peer === b!.key)?.deliveredAt, 30000);
    assert.equal(info?.recipients.find((row) => row.peer === c!.key)?.readAt, 31000);
    assert.equal(
      info?.message.status,
      'delivered',
      'one unread original recipient keeps aggregate status delivered',
    );
  } finally {
    await f.close();
  }
});

test('receipt observations survive supported encrypted-history snapshot round trips; older snapshots remain readable with unknown delivery times', async () => {
  const f = await fixture(false);
  const restoredStorage = deliveryDatabase(),
    legacyStorage = deliveryDatabase();
  const restored = new DeviceMessenger(restoredStorage.db, randomBytes, randomUUID);
  const legacy = new DeviceMessenger(legacyStorage.db, randomBytes, randomUUID);
  try {
    const b = f.peers[0]!,
      chat = await f.engine.trustContact(b);
    const id = await f.engine.send(chat, 'Backup', { deferDelivery: true });
    f.at(40000);
    await f.engine.receive(b.key, { type: 'ack', id });
    const snapshot = await f.engine.snapshot();
    await restored.initialize();
    await restored.restoreSnapshot(snapshot);
    assert.equal((await restored.messageInfo(chat, id))?.recipients[0]?.deliveredAt, 40000);
    const old = JSON.parse(snapshot);
    delete old.tables.message_receipt_info;
    await legacy.initialize();
    await legacy.restoreSnapshot(JSON.stringify(old));
    assert.equal((await legacy.messageInfo(chat, id))?.recipients[0]?.deliveredAt, null);
    assert.equal((await legacy.messageInfo(chat, id))?.recipients[0]?.status, 'delivered');
  } finally {
    await restored.close();
    await legacy.close();
    await f.close();
  }
});
