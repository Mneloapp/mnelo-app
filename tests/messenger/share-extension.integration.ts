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
    name: 'ჩემი ბობი',
  });
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
  const photo = randomBytes(280_000).toString('base64');
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
    assert.equal((await session.open()).find((row) => row.id === chat)?.title, 'ჩემი ბობი');
    assert.equal((await ae.messages(chat)).length, 0, 'opening picker never sends');
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
    const cancelled = new ShareSession({ ...host, count: 1 });
    await cancelled.open();
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
