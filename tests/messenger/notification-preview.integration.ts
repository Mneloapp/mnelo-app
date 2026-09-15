import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { fixtureSms } from '../../identity/verification';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { DeviceMessenger } from '../../src/messenger/engine';
import { PhoneClient } from '../../src/messenger/phone-client';
import { ApplicationDelivery } from '../../src/messenger/delivery/application';
import { NotificationSession } from '../../src/messenger/notification-session';
import {
  notificationText,
  readNotificationPreview,
} from '../../src/messenger/notification-preview';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';
import { rememberPhonebookName } from '../../src/messenger/phonebook-match';

test('notification sends a durable delivery receipt while app is closed, without marking read; app resumes once', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-notification-'));
  const a = deliveryDatabase(),
    b = deliveryDatabase(join(directory, 'recipient.db'));
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  await ae.initialize();
  await be.initialize();
  const ar = await ae.createIdentity('Alice'),
    br = await be.createIdentity('Bob');
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const service = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: (key) => Boolean(registry.status(key)),
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
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
      service,
    ),
  );
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const oldURL = process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
    oldEnv = process.env.EXPO_PUBLIC_APP_ENV;
  process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL = url;
  process.env.EXPO_PUBLIC_APP_ENV = 'local';
  for (const [engine, root, phone] of [
    [ae, ar, '+12025550101'],
    [be, br, '+12025550102'],
  ] as const) {
    registry.bind(registry.index(phone), root.key, true, Date.now());
    await engine.completePhoneEnrollment(
      { phone, service: url, testOnly: true, verifiedAt: Date.now() },
      root.key,
    );
    await engine.enableSignalDelivery();
  }
  const chat = await ae.trustPhoneContact({ key: br.key, phone: '+12025550102' });
  await be.trustPhoneContact({ key: ar.key, phone: '+12025550101', name: 'Old alias' });
  const alice = new ApplicationDelivery(
    ae,
    new PhoneClient(url, ar),
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async () => null,
  );
  const bob = new ApplicationDelivery(
    be,
    new PhoneClient(url, br),
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async () => null,
  );
  ae.attachTransport({
    send: () => false,
    sendDurable: (...args) => alice.sendDurable(...args),
    stop: () => {},
  });
  be.attachTransport({
    send: () => false,
    sendDurable: (...args) => bob.sendDurable(...args),
    stop: () => {},
  });
  const extension = deliveryDatabase(join(directory, 'recipient.db'));
  const commands: string[] = [];
  let dropReceipt = false;
  const session = new NotificationSession({
    db: extension.db,
    random: randomBytes,
    uuid: randomUUID,
    signal: new NodeSignal(),
    savedContacts: async () => {
      const names = new Map();
      rememberPhonebookName(names, '+12025550101', 'ჩემი ალისა ❤️');
      return names;
    },
    request: (async (input, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.command) commands.push(request.command.action);
      if (dropReceipt && request.command?.action === 'delivery-submit') throw new Error('OFFLINE');
      return fetch(input, init);
    }) as typeof fetch,
  });
  try {
    await bob.start();
    await bob.pump.tick();
    bob.pump.stop();
    await alice.start();
    await alice.pump.tick();
    const message = await ae.send(chat, 'გამარჯობა 👋 პირადი ტექსტი');
    for (let i = 0; i < 4; i++) await alice.pump.tick();
    alice.pump.stop();
    assert.equal((await be.messages(chat)).length, 0);
    assert.ok(service.store.fetch(br.key).some((row) => row.notify?.id === message));
    const result = await session.preview(message, 'ka');
    assert.deepEqual(result, {
      id: message,
      chat,
      title: 'ჩემი ალისა ❤️',
      body: 'გამარჯობა 👋 პირადი ტექსტი',
    });
    assert.equal((await be.messages(chat)).length, 0, 'extension never projects or marks read');
    assert.ok(
      service.store.fetch(br.key).some((row) => row.notify?.id === message),
      'not ACKed before app projection',
    );
    assert.ok(
      !commands.some((action) =>
        ['delivery-ack', 'delivery-publish', 'delivery-keys'].includes(action),
      ),
    );
    assert.ok(commands.includes('delivery-submit'));
    await alice.start();
    for (let i = 0; i < 4; i++) await alice.pump.tick();
    assert.equal(
      (await ae.messages(chat)).find((row) => row.id === message)?.status,
      'delivered',
      'gray leaf before recipient opens app',
    );
    assert.equal((await be.messages(chat)).length, 0);
    const state = extension.sql.prepare('SELECT state FROM signal_state').get()?.state;
    assert.deepEqual(
      await session.preview(message),
      result,
      'duplicate preview reuses durable plaintext inside encrypted vault',
    );
    assert.equal(extension.sql.prepare('SELECT state FROM signal_state').get()?.state, state);
    await b.db.run('UPDATE contacts SET blocked=1 WHERE public_key=?', ar.key);
    assert.equal(await session.preview(message), null, 'blocked caller cannot supply a preview');
    await b.db.run('UPDATE contacts SET blocked=0 WHERE public_key=?', ar.key);
    const receipts = () =>
      b.sql.prepare('SELECT count(*) AS n FROM signal_inbox WHERE receipt_id IS NOT NULL').get()?.n;
    assert.equal(receipts(), 1);
    // A failed upload still leaves one sealed, retryable receipt. Repeated alerts
    // reuse its ciphertext, and foreground projection must not queue a second one.
    const second = await ae.send(chat, 'Receipt will retry');
    for (let i = 0; i < 4; i++) await alice.pump.tick();
    dropReceipt = true;
    assert.ok(await session.preview(second));
    const sealed = extension.sql.prepare('SELECT wire FROM signal_outbox WHERE uploaded=0').all();
    assert.ok(sealed.some((row) => row.wire));
    const failedState = extension.sql.prepare('SELECT state FROM signal_state').get()?.state;
    assert.ok(await session.preview(second));
    assert.equal(extension.sql.prepare('SELECT state FROM signal_state').get()?.state, failedState);
    assert.deepEqual(
      extension.sql.prepare('SELECT wire FROM signal_outbox WHERE uploaded=0').all(),
      sealed,
    );
    assert.equal(receipts(), 2);
    await session.close();
    await bob.start();
    for (let i = 0; i < 6; i++) await bob.pump.tick();
    assert.equal((await be.messages(chat)).filter((row) => row.id === message).length, 1);
    assert.equal(b.sql.prepare('SELECT is_read FROM messages WHERE id=?').get(message)?.is_read, 0);
    await alice.start();
    for (let i = 0; i < 6; i++) await alice.pump.tick();
    assert.equal((await ae.messages(chat)).find((row) => row.id === message)?.status, 'delivered');
    assert.equal((await ae.messages(chat)).find((row) => row.id === second)?.status, 'delivered');
    assert.equal(receipts(), 2, 'app projection reuses extension receipts');
    await be.markRead(chat);
    for (let i = 0; i < 4; i++) {
      await bob.pump.tick();
      await alice.pump.tick();
    }
    assert.equal((await ae.messages(chat)).find((row) => row.id === message)?.status, 'read');
    await be.deleteLocalMessage(message);
    assert.equal(await readNotificationPreview(be.deliveryAtomic, br.key, message), null);
  } finally {
    alice.stop();
    bob.stop();
    // Session may already have closed the extension connection.
    try {
      await session.close();
    } catch {}
    await ae.close();
    await be.close();
    server.close();
    server.closeAllConnections();
    service.close();
    registry.close();
    if (oldURL === undefined) delete process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL;
    else process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL = oldURL;
    if (oldEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = oldEnv;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('notification content is bounded and uses media labels without exposing serialized files', () => {
  assert.equal(
    notificationText({ kind: 'text', body: '  hello\n\tworld  ', mime: '' }),
    'hello world',
  );
  assert.equal(
    Array.from(notificationText({ kind: 'text', body: '😀'.repeat(400), mime: '' })).length,
    240,
  );
  assert.equal(
    notificationText({ kind: 'file', body: 'PRIVATE FILENAME', mime: 'video/mp4' }, 'ka'),
    'ვიდეო',
  );
  assert.equal(notificationText({ kind: 'contact', body: 'PRIVATE VCARD', mime: '' }), 'Contact');
});

test('preview rejects malformed, cross-chat, blocked, deleted, and wrong-phone content before display', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  await ae.initialize();
  await be.initialize();
  const alice = await ae.createIdentity('Alice'),
    bob = await be.createIdentity('Bob');
  const chat = await be.trustPhoneContact({ key: alice.key, phone: '+12025550101' });
  const id = randomUUID();
  const packet = {
    type: 'message',
    id,
    chat,
    body: 'Private text',
    kind: 'text',
    sentAt: Date.now(),
    replyTo: null,
    media: null,
  };
  const content = { version: 2, phone: '+12025550101', name: 'Untrusted name', packet };
  const read = (body = JSON.stringify(content)) =>
    readNotificationPreview(be.deliveryAtomic, bob.key, id, { sender: alice.key, body });
  try {
    assert.equal((await read())?.body, 'Private text');
    assert.equal(await read('{invalid'), null);
    assert.equal(await read(JSON.stringify({ ...content, phone: '+12025550999' })), null);
    assert.equal(
      await read(JSON.stringify({ ...content, packet: { ...packet, chat: randomUUID() } })),
      null,
    );
    await b.db.run('UPDATE contacts SET blocked=1');
    assert.equal(await read(), null);
    await b.db.run('UPDATE contacts SET blocked=0');
    await b.db.run(
      'INSERT INTO message_changes VALUES(?,?,?,?,?,?,?)',
      id,
      alice.key,
      chat,
      1,
      'edit',
      'Corrected text',
      Date.now(),
    );
    assert.equal((await read())?.body, 'Corrected text');
    await b.db.run("UPDATE message_changes SET action='delete',body=''");
    assert.equal(await read(), null);
    await b.db.run('DELETE FROM message_changes');
    await b.db.run('INSERT INTO forgotten_messages VALUES(?,?)', id, alice.key);
    assert.equal(await read(), null);
  } finally {
    await ae.close();
    await be.close();
  }
});
