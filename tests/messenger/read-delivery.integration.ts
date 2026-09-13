import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeviceMessenger } from '../../src/messenger/engine';
import type { Packet } from '../../src/messenger/model';
import { deliveryDatabase } from './delivery-fixture';

test('out-of-order delivery marks only IDs actually read; missing earlier messages and unrelated chats stay unread', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  await ae.initialize();
  await be.initialize();
  const ar = await ae.createIdentity('Development A'),
    br = await be.createIdentity('Development B');
  const chat = await ae.trustContact({ key: br.key, name: 'Development B' });
  await be.trustContact({ key: ar.key, name: 'Development A' });
  await ae.enableSignalDelivery();
  await be.enableSignalDelivery();
  const outbound: Packet[] = [],
    receipts: Packet[] = [];
  ae.attachTransport({
    send: () => false,
    sendDurable: async (_peer, packet) => {
      outbound.push(packet);
      return true;
    },
    stop() {},
  });
  be.attachTransport({
    send: () => false,
    sendDurable: async (_peer, packet) => {
      receipts.push(packet);
      return true;
    },
    stop() {},
  });
  try {
    const first = await ae.send(chat, 'FICTIONAL_DELAYED_FIRST');
    const second = await ae.send(chat, 'FICTIONAL_EARLY_SECOND');
    const secondPacket = outbound.find(
      (packet) => packet.type === 'message' && packet.id === second,
    )!;
    await be.receive(ar.key, secondPacket, { sendReceipts: false });
    await be.markRead(chat);
    const read = receipts.find((packet) => packet.type === 'read_ids')!;
    assert.deepEqual(read, { type: 'read_ids', chat, ids: [second] });
    assert.equal(await ae.receive(br.key, read), true);
    assert.equal(
      (await ae.messages(chat)).find((message) => message.id === first)?.status,
      'pending',
    );
    assert.equal(
      (await ae.messages(chat)).find((message) => message.id === second)?.status,
      'read',
    );
    const before = receipts.length;
    await be.markRead(chat);
    assert.equal(receipts.length, before, 'already-read messages do not enqueue repeated receipts');
    assert.equal(
      await ae.receive(br.key, { type: 'read_ids', chat: randomUUID(), ids: [first] }),
      false,
    );
    assert.equal(
      (await ae.messages(chat)).find((message) => message.id === first)?.status,
      'pending',
    );
    await ae.receive(br.key, { type: 'read', chat, through: second });
    assert.equal(
      (await ae.messages(chat)).find((message) => message.id === first)?.status,
      'pending',
      'legacy through receipt cannot overclaim in a migrated vault',
    );
    await be.receive(
      ar.key,
      outbound.find((packet) => packet.type === 'message' && packet.id === first)!,
      { sendReceipts: false },
    );
    await be.markRead(chat);
    const final = receipts.at(-1)!;
    assert.deepEqual(final, { type: 'read_ids', chat, ids: [first] });
    await ae.receive(br.key, final);
    assert.equal((await ae.messages(chat)).find((message) => message.id === first)?.status, 'read');
  } finally {
    await ae.close();
    await be.close();
  }
});
