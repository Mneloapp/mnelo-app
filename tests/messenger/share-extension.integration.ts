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
import { ShareSession, type ShareItem } from '../../src/messenger/share-extension';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';
import { emptyProfile } from '../../src/messenger/local-profile';
import { SignalJournal } from '../../src/messenger/delivery/journal';
import { createKeys } from '../../src/messenger/crypto';
import { ContactView } from '../../src/messenger/contact-view';
import { rememberPhonebookName, type PhonebookMatch } from '../../src/messenger/phonebook-match';

test('native share engine sends actual encrypted photo/text, skips the inbox and retries only uncommitted items', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID),
    be = new DeviceMessenger(b.db, randomBytes, randomUUID);
  await ae.initialize();
  await be.initialize();
  const ar = await ae.createIdentity('Share fixture Alice'),
    br = await be.createIdentity('Share fixture Bob');
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
  const url = `http://127.0.0.1:${address.port}`;
  const previous = {
    service: process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
    env: process.env.EXPO_PUBLIC_APP_ENV,
  };
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
  const chat = await ae.trustPhoneContact({
    key: br.key,
    phone: '+12025550102',
    name: 'Old Mnelo alias',
  });
  await ae.receiveProfile(
    br.key,
    { ...emptyProfile(), firstName: 'Current', lastName: 'Profile' },
    1,
  );
  let phoneName: string | null = 'ჩემი ბობი';
  const bob = new ApplicationDelivery(
    be,
    new PhoneClient(url, br),
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async () => null,
  );
  const actions: string[] = [];
  let unavailable = true,
    offline = false;
  const photo = randomBytes(750_000).toString('base64');
  const items: ShareItem[] = [
    { kind: 'text', text: 'ქართული გაზიარება' },
    {
      kind: 'image',
      media: { name: 'photo.jpg', mime: 'image/jpeg', bytes: photo, duration: null },
    },
  ];
  const host = {
    db: { ...a.db, async close() {} },
    random: randomBytes,
    uuid: randomUUID,
    signal: new NodeSignal(),
    count: items.length,
    savedContacts: async (numbers: readonly string[], own: string) => {
      assert.equal(own, '+12025550101');
      const matches = new Map<string, PhonebookMatch>();
      if (phoneName && numbers.includes('+12025550102')) {
        rememberPhonebookName(matches, '+12025550102', phoneName);
        rememberPhonebookName(matches, '+12025550102', 'Bob <3');
        rememberPhonebookName(matches, '+12025550102', phoneName);
      }
      return matches;
    },
    item: (index: number) => {
      if (index === 1 && unavailable) throw new Error('SHARE_FILE_UNAVAILABLE');
      return items[index]!;
    },
    request: (async (input, init) => {
      if (offline) throw new Error('PHONE_REQUEST_FAILED');
      const body = JSON.parse(String(init?.body));
      if (body.command) actions.push(body.command.action);
      return fetch(input, init);
    }) as typeof fetch,
  };
  const session = new ShareSession(host);
  try {
    await bob.start();
    await bob.pump.tick();
    bob.pump.stop();
    const recipients = await session.open();
    const recipient = recipients.find((row) => row.id === chat)!;
    const chats = new ContactView(ae, new Map([[br.key, phoneName!]]));
    assert.equal(recipient.title, (await chats.chat(chat))?.title);
    assert.equal(recipient.title, 'ჩემი ბობი');
    assert.deepEqual(recipient.searchTerms, ['ჩემი ბობი', 'Bob <3', '+12025550102']);
    assert.equal(recipients.filter((row) => row.id === chat).length, 1);
    assert.equal((await ae.messages(chat)).length, 0, 'opening picker never sends');
    // More than one delivery page of older, not-yet-ready peers must not starve
    // this explicit share or stop a multi-chunk image after its first step.
    const backlog = new SignalJournal(ae.deliveryAtomic, new NodeSignal(), ar);
    const unavailablePeer = createKeys(randomBytes).key;
    for (let index = 0; index < 21; index++)
      await backlog.enqueue(unavailablePeer, randomUUID(), '{}');
    const first = await session.send(chat);
    assert.equal(first.committed, 1);
    assert.equal(first.failure, 'SHARE_FILE_UNAVAILABLE');
    unavailable = false;
    const second = await session.send(chat);
    assert.equal(second.committed, 2);
    assert.equal(second.uploaded, true);
    assert.equal((await ae.messages(chat)).length, 2, 'retry never duplicates the committed text');
    assert.ok(!actions.includes('delivery-inbox'));
    assert.ok(!actions.includes('delivery-ack'));
    await bob.start();
    for (let i = 0; i < 6; i++) await bob.pump.tick();
    const received = await be.messages(chat);
    assert.equal(received.length, 2);
    assert.ok(received.some((row) => row.body === 'ქართული გაზიარება'));
    const image = received.find((row) => row.kind === 'image')!;
    assert.equal((await be.media(image.id))?.bytes, photo);
    bob.pump.stop();
    await session.close();
    offline = true;
    const queued = new ShareSession({ ...host, count: 1 });
    await queued.open();
    const result = await queued.send(chat);
    assert.equal(result.committed, 1);
    assert.equal(result.uploaded, false);
    assert.equal((await ae.messages(chat)).length, 3, 'offline share is durable in main history');
    await queued.close();
    phoneName = 'ახალი სახელი';
    const renamed = new ShareSession({ ...host, count: 1 });
    const renamedRecipient = (await renamed.open()).find((row) => row.id === chat)!;
    assert.equal(renamedRecipient.title, phoneName);
    assert.deepEqual(renamedRecipient.searchTerms, [phoneName, 'Bob <3', '+12025550102']);
    await renamed.close();
    phoneName = null; // Permission denied or contact removed: current profile, never old alias.
    const cancelled = new ShareSession({ ...host, count: 1 });
    const fallback = (await cancelled.open()).find((row) => row.id === chat)!;
    assert.equal(fallback.title, 'Current Profile');
    assert.deepEqual(fallback.searchTerms, ['Current Profile', '+12025550102']);
    assert.equal((await ae.contacts()).find((row) => row.key === br.key)?.name, 'Old Mnelo alias');
    await cancelled.close();
    assert.equal((await ae.messages(chat)).length, 3, 'cancel only closes the picker');
    await ae.block(br.key, true);
    const blocked = new ShareSession(host);
    assert.equal(
      (await blocked.open()).some((row) => row.id === chat),
      false,
    );
    const denied = await blocked.send(chat);
    assert.equal(denied.committed, 0);
    assert.equal(denied.failure, 'CONTACT_BLOCKED');
    await blocked.close();
  } finally {
    await session.close();
    bob.stop();
    await ae.close();
    await be.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    registry.close();
    delivery.close();
    if (previous.service === undefined) delete process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL;
    else process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL = previous.service;
    if (previous.env === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = previous.env;
  }
});
