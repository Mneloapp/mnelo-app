import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { fixtureSms } from '../../identity/verification';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { MediaStore } from '../../identity/media-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { DeviceMessenger } from '../../src/messenger/engine';
import { PhoneClient } from '../../src/messenger/phone-client';
import { ApplicationDelivery } from '../../src/messenger/delivery/application';
import { MEDIA_CHUNK_BYTES } from '../../src/messenger/delivery/media-schema';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';
import jpeg from 'jpeg-js';

test('real app histories receive first-contact text and media with sender offline, keep local names, and distinguish durable delivery from read', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  await ae.initialize();
  await be.initialize();
  const ar = await ae.createIdentity('Development Alice'),
    br = await be.createIdentity('Development Bob');
  const avatar = Buffer.from(
    jpeg.encode({ width: 4, height: 4, data: Buffer.alloc(64, 255) }, 60).data,
  ).toString('base64');
  await ae.saveProfile({ ...ae.currentProfile(), headline: 'Development profile', avatar });
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const access = {
    registered: (key: string) => Boolean(registry.status(key)),
    canContact: () => true,
  };
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), access),
    new SignalDirectory(new DatabaseSync(':memory:')),
    new MediaStore(new DatabaseSync(':memory:'), access),
  );
  const server = startPhoneHttp(
    new PhoneService(
      registry,
      fixtureSms(true),
      Date.now,
      undefined,
      undefined,
      undefined,
      undefined,
      delivery,
    ),
  );
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`,
    apn = '+12025550101',
    bpn = '+12025550102';
  for (const [engine, root, phone] of [
    [ae, ar, apn],
    [be, br, bpn],
  ] as const) {
    registry.bind(registry.index(phone), root.key, true, Date.now());
    await engine.completePhoneEnrollment(
      { phone, service: url, testOnly: true, verifiedAt: Date.now() },
      root.key,
    );
  }
  const chat = await ae.trustPhoneContact({ key: br.key, phone: bpn, name: 'My saved Bob' });
  const ac = new PhoneClient(url, ar),
    bc = new PhoneClient(url, br);
  const appA = new ApplicationDelivery(
    ae,
    ac,
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async () => null,
  );
  const appB = new ApplicationDelivery(
    be,
    bc,
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async (phone) => (phone === apn ? 'ჩემი ალისა' : null),
  );
  for (const [engine, app] of [
    [ae, appA],
    [be, appB],
  ] as const)
    engine.attachTransport({
      send() {
        throw new Error('LEGACY_SEND_FORBIDDEN_IN_FIXTURE');
      },
      sendDurable: (...args) => app.sendDurable(...args),
      stop: () => app.stop(),
    });
  try {
    await appB.start();
    await appB.pump.tick();
    await appA.start();
    await appA.pump.tick();
    appB.pump.stop();
    const first = await ae.send(chat, 'FICTIONAL_FIRST_CONTACT_TEXT');
    const photo = randomBytes(MEDIA_CHUNK_BYTES * 3 + 1);
    const image = await ae.send(chat, '', {
      kind: 'image',
      media: {
        name: 'fixture.jpg',
        mime: 'image/jpeg',
        bytes: photo.toString('base64'),
        duration: null,
      },
    });
    const second = await ae.send(chat, 'FICTIONAL_TEXT_DURING_PHOTO');
    assert.equal((await ae.messages(chat)).find((row) => row.id === first)?.status, 'pending');
    await appA.pump.tick();
    assert.ok(delivery.store.fetch(br.key).length >= 2, 'photo upload cannot block text envelopes');
    await appA.pump.tick();
    appA.pump.stop();
    assert.equal((await be.contacts()).length, 0, 'recipient has not manually added sender');
    appB.pump.start();
    await appB.pump.tick();
    await appB.pump.tick();
    assert.equal((await be.contacts())[0]?.name, 'ჩემი ალისა');
    assert.equal((await be.contactProfile(ar.key))?.avatar, avatar);
    const rows = await be.messages(chat);
    assert.equal(rows.length, 3);
    assert.ok(rows.some((row) => row.id === first));
    assert.ok(rows.some((row) => row.id === second));
    assert.equal((await be.media(image))?.bytes, photo.toString('base64'));
    assert.equal(delivery.store.fetch(br.key).length, 0);
    assert.equal(
      (await ae.messages(chat)).find((row) => row.id === first)?.status,
      'pending',
      'server upload is not a delivery receipt',
    );
    appA.pump.start();
    await appA.pump.tick();
    assert.equal((await ae.messages(chat)).find((row) => row.id === first)?.status, 'delivered');
    await be.markRead(chat);
    await appB.pump.tick();
    await appA.pump.tick();
    assert.equal((await ae.messages(chat)).find((row) => row.id === first)?.status, 'read');
    await ae.saveProfile({ ...ae.currentProfile(), headline: 'Updated development profile' });
    await appA.pump.tick();
    await appB.pump.tick();
    await appB.pump.tick();
    assert.equal((await be.contactProfile(ar.key))?.headline, 'Updated development profile');
    await be.receiveProfile(ar.key, { ...ae.currentProfile(), headline: 'Stale profile' }, 1);
    assert.equal((await be.contactProfile(ar.key))?.headline, 'Updated development profile');
    assert.equal(
      (await be.contacts())[0]?.name,
      'ჩემი ალისა',
      'profile updates preserve the local address-book name',
    );
    appB.pump.stop();
    await be.react(second, '👍');
    await be.react(second, '👍');
    await be.react(second, '👍');
    appB.pump.start();
    await appB.pump.tick();
    await appA.pump.tick();
    assert.deepEqual(
      (await ae.reactions(second)).map((row) => ({ ...row })),
      [{ peer: br.key, emoji: '👍' }],
      'distinct toggle events are not collapsed into an older identical payload',
    );
    await be.deleteLocalMessage(first);
    assert.ok(
      (await ae.messages(chat)).some((row) => row.id === first),
      'local deletion never removes the other participant copy',
    );
    await ae.flush();
    await appA.pump.tick();
    await appB.pump.tick();
    assert.equal(
      (await be.messages(chat)).length,
      2,
      'retry cannot resurrect a locally deleted message',
    );
    const fake = (
      await bc.execute({
        action: 'delivery-verify-sender',
        peer: ar.key,
        id: randomUUID(),
        phone: apn,
      })
    ).delivery;
    assert.equal(
      fake?.verified,
      false,
      'no reverse-phone verification without an addressed pending envelope',
    );
    assert.equal((await be.contacts()).length, 1);
    appB.pump.stop();
    // Call presentation uses a call-UUID ACK, not the server's queue acceptance.
    // The unchanged packet schema is also safe for clients without the new callback.
    const callId = randomUUID();
    const confirmations: string[] = [];
    const invites: string[] = [];
    appA.calls = {
      control: async () => {},
      signal: async () => {},
      ringingReceipt: async (peer, id) => {
        if (peer === br.key) confirmations.push(id);
      },
    };
    appB.calls = {
      control: async (_peer, packet) => {
        invites.push(packet.id);
      },
      signal: async () => {},
    };
    await appA.sendDurable(br.key, { type: 'call', id: callId, action: 'invite', media: 'voice' });
    await appA.pump.tick();
    assert.deepEqual(confirmations, [], 'an offline recipient cannot confirm ringing');
    appB.pump.start();
    await appB.pump.tick();
    await appA.pump.tick();
    assert.deepEqual(invites, [callId]);
    assert.deepEqual(confirmations, [], 'an authenticated invite alone is not UI presentation');
    appB.pump.stop();
    await appB.sendRingingReceipt(ar.key, callId);
    const ringing = (await appB.journal.pending()).find(
      (row) => JSON.parse(row.body).packet.id === callId,
    );
    assert.equal(ringing?.priority, 2, 'ringing confirmation bypasses ordinary uploads');
    appB.pump.start();
    await appB.pump.tick();
    await appA.pump.tick();
    assert.deepEqual(
      confirmations,
      [callId],
      'presentation confirmation crosses the actual Signal/HTTP path',
    );
    assert.equal(
      (await ae.messages(chat)).some((row) => row.id === callId),
      false,
    );
    appA.calls = null;
    const olderCallerId = randomUUID();
    await appB.sendRingingReceipt(ar.key, olderCallerId);
    await appB.pump.tick();
    await appA.pump.tick();
    assert.equal(
      (await ae.messages(chat)).some((row) => row.id === olderCallerId),
      false,
    );
    assert.equal(
      delivery.store.fetch(ar.key).length,
      0,
      'legacy ACK handling consumes the receipt without new messages',
    );
    appB.pump.stop();
    await be.block(ar.key, true);
    const blockedLater = await ae.send(chat, 'FICTIONAL_BLOCKED_PENDING');
    await appA.pump.tick();
    appB.pump.start();
    await appB.pump.tick();
    assert.equal(delivery.store.allowed(ar.key, br.key), false);
    assert.equal(delivery.store.fetch(br.key).length, 0);
    assert.equal(
      (await be.messages(chat)).some((row) => row.id === blockedLater),
      false,
    );
    await ae.deleteLocalMessage(image);
    assert.equal(
      a.sql
        .prepare('SELECT count(*) AS count FROM delivery_media_outbox WHERE message_id=?')
        .get(image)?.count,
      0,
      'delete removes local private file descriptors too',
    );
    await be.eraseLocalData();
    assert.equal(
      b.sql.prepare('SELECT count(*) AS count FROM signal_state').get()?.count,
      0,
      'account deletion clears native session secrets',
    );
    assert.equal(
      b.sql.prepare('SELECT count(*) AS count FROM delivery_media_inbox').get()?.count,
      0,
    );
  } finally {
    appA.stop();
    appB.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delivery.close();
    registry.close();
    await ae.close();
    await be.close();
  }
});
