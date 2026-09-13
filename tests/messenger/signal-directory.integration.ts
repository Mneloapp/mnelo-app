import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { SignalDirectory } from '../../identity/signal-directory';
import { DeliveryStore } from '../../identity/delivery-store';
import { DeliveryService } from '../../identity/delivery-service';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { fixtureSms } from '../../identity/verification';
import { createKeys, sign } from '../../src/messenger/crypto';
import { PhoneClient } from '../../src/messenger/phone-client';
import { phoneProofPayload, type PhoneCommand } from '../../src/messenger/phone-protocol';
import {
  signalBindingPayload,
  type PublishedSignalKeys,
} from '../../src/messenger/delivery/schema';
import { SignalFixture } from './signal-fixture';

const publication = (root: ReturnType<typeof createKeys>, keys: PublishedSignalKeys) => ({
  action: 'delivery-publish' as const,
  keys,
  signature: sign(
    root.secret,
    signalBindingPayload({
      owner: root.key,
      identity: keys.identity,
      registration: keys.registration,
      device: 1,
    }),
  ),
});

test('public Signal keys require the registered root signature, cannot replace identity and cannot reuse a consumed one-time key', () => {
  const db = new DatabaseSync(':memory:'),
    directory = new SignalDirectory(db);
  const root = createKeys(randomBytes),
    other = createKeys(randomBytes);
  const keys = new SignalFixture(root.key).publicKeys(),
    pub = publication(root, keys);
  try {
    assert.throws(() => directory.publish(other.key, keys, pub.signature), /IDENTITY_INVALID/);
    assert.equal(directory.publish(root.key, keys, pub.signature), 1);
    assert.equal(directory.take(root.key)?.bundle.oneTime.id, 1);
    assert.equal(directory.take(root.key), null);
    assert.equal(directory.publish(root.key, keys, pub.signature), 0);
    const replacement = new SignalFixture(root.key).publicKeys();
    assert.throws(
      () => directory.publish(root.key, replacement, publication(root, replacement).signature),
      /IDENTITY_CHANGED/,
    );
    const exported = JSON.stringify(db.prepare('SELECT * FROM signal_identities').all());
    assert.equal(exported.includes(root.secret), false);
    directory.unlink(root.key);
    assert.equal(directory.identity(root.key), null);
  } finally {
    directory.close();
  }
});

test('invalid key batches roll back atomically, signed key IDs cannot be reused with altered content', () => {
  const directory = new SignalDirectory(new DatabaseSync(':memory:'));
  const root = createKeys(randomBytes),
    keys = new SignalFixture(root.key).publicKeys(),
    pub = publication(root, keys);
  try {
    directory.publish(root.key, keys, pub.signature);
    const first = keys.oneTime[0]!;
    assert.throws(
      () => directory.publish(root.key, { ...keys, oneTime: [first, first] }, pub.signature),
      /KEYS_INVALID/,
    );
    assert.equal(directory.count(root.key), 1);
    assert.throws(
      () =>
        directory.publish(
          root.key,
          { ...keys, signed: { ...keys.signed, key: first.key } },
          pub.signature,
        ),
      /KEYS_INVALID/,
    );
    assert.equal(directory.take(root.key)?.bundle.signed.key, keys.signed.key);
  } finally {
    directory.close();
  }
});

test('authenticated delivery HTTP rejects missing registration, replay, sender spoofing and cross-recipient reads/acks', async () => {
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const a = createKeys(randomBytes),
    b = createKeys(randomBytes),
    unknown = createKeys(randomBytes);
  registry.bind(registry.index('+12025550101'), a.key, true, Date.now());
  registry.bind(registry.index('+12025550102'), b.key, true, Date.now());
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
  const ac = new PhoneClient(url, a),
    bc = new PhoneClient(url, b),
    uc = new PhoneClient(url, unknown);
  try {
    await assert.rejects(uc.execute({ action: 'delivery-inbox' }), /REGISTRATION_REQUIRED/);
    await ac.execute(publication(a, new SignalFixture(a.key).publicKeys()));
    await bc.execute(publication(b, new SignalFixture(b.key).publicKeys()));
    const leaseRequest = { action: 'delivery-keys' as const, peer: b.key, request: randomUUID() };
    const leased = (await ac.execute(leaseRequest)).delivery?.keys;
    assert.equal(leased?.bundle.device, 1);
    // Network retries must neither exhaust the peer's one-time key stock nor the
    // per-pair new-session limit, and must return the exact same public bundle.
    for (let retry = 0; retry < 5; retry++)
      assert.deepEqual((await ac.execute(leaseRequest)).delivery?.keys, leased);
    assert.equal(
      (await ac.execute({ action: 'delivery-keys', peer: b.key, request: randomUUID() })).delivery
        ?.keys,
      null,
    );
    const envelope = {
      version: 2 as const,
      id: randomUUID(),
      createdAt: Date.now(),
      recipient: b.key,
      type: 3 as const,
      ciphertext: Buffer.alloc(40000, 17).toString('base64'),
    };
    await ac.execute({ action: 'delivery-submit', envelope });
    assert.equal((await ac.execute({ action: 'delivery-inbox' })).delivery?.inbox?.length, 0);
    await ac.execute({ action: 'delivery-ack', sender: a.key, id: envelope.id });
    assert.equal((await bc.execute({ action: 'delivery-inbox' })).delivery?.inbox?.length, 1);
    const command: PhoneCommand = { action: 'delivery-inbox' };
    const { nonce } = service.challenge(b.key, 'fixture');
    const proof = {
      key: b.key,
      nonce,
      command,
      signature: sign(b.secret, phoneProofPayload(b.key, nonce, command)),
    };
    const request = async (body: unknown, path = '/delivery') =>
      fetch(url + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal((await request(proof)).status, 200);
    assert.equal((await request(proof)).status, 400);
    assert.equal((await request({ ...proof, key: a.key })).status, 400);
    assert.equal((await request(proof, '/execute')).status, 400);
    assert.equal((await request({ ...proof, sender: b.key })).status, 400);
    await bc.execute({ action: 'delivery-ack', sender: a.key, id: envelope.id });
    assert.equal((await bc.execute({ action: 'delivery-inbox' })).delivery?.inbox?.length, 0);
    await bc.execute({ action: 'delivery-block', peer: a.key, blocked: true });
    assert.equal(
      (await ac.execute({ action: 'delivery-identity', peer: b.key })).delivery?.identity,
      null,
    );
    await assert.rejects(
      ac.execute({ action: 'delivery-submit', envelope: { ...envelope, id: randomUUID() } }),
      /UNAVAILABLE/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delivery.close();
    registry.close();
  }
});
