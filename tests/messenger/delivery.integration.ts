import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeliveryStore } from '../../identity/delivery-store';
import { DELIVERY_TTL_MS, type DeliveryEnvelope } from '../../src/messenger/delivery/schema';
import { SignalFixture } from './signal-fixture';

const alice = 'a'.repeat(64),
  bob = 'b'.repeat(64),
  other = 'c'.repeat(64),
  unknown = 'd'.repeat(64);
const access = {
  registered: (key: string) => [alice, bob, other].includes(key),
  canContact: () => true,
};
const sample = (createdAt = Date.now()): DeliveryEnvelope => ({
  version: 2,
  id: randomUUID(),
  recipient: bob,
  createdAt,
  type: 3,
  ciphertext: Buffer.alloc(128, 37).toString('base64'),
});

test('real Signal ciphertext survives sender disappearance and server restart, and is removed after recipient ack', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-delivery-fixture-'));
  const file = join(directory, 'spool.db');
  let service: DeliveryStore | undefined;
  try {
    const a = new SignalFixture(alice),
      b = new SignalFixture(bob);
    await a.connect(b);
    const plaintext = 'DEVELOPMENT_FIXTURE_ONLY_OFFLINE_DELIVERY';
    const encrypted = await a.encrypt(b.address, plaintext);
    const envelope = { ...sample(), ...encrypted };
    service = new DeliveryStore(new DatabaseSync(file), access);
    const accepted = service.submit(alice, envelope);
    assert.equal(accepted.expiresAt, envelope.createdAt + DELIVERY_TTL_MS);
    assert.equal(readFileSync(file).includes(Buffer.from(plaintext)), false);
    service.close();
    // Neither the sender nor an open sender-recipient socket participates below.
    service = new DeliveryStore(new DatabaseSync(file), access);
    assert.deepEqual(service.fetch(other), []);
    assert.throws(() => service!.fetch(unknown), /UNAUTHORIZED/);
    service.acknowledge(other, alice, envelope.id);
    const pending = service.fetch(bob);
    assert.equal(pending.length, 1);
    assert.equal(await b.decrypt(a.address, pending[0]!), plaintext);
    service.acknowledge(bob, alice, envelope.id);
    assert.deepEqual(service.fetch(bob), []);
    // A lost upload response cannot recreate already-acknowledged ciphertext.
    assert.deepEqual(service.submit(alice, envelope), accepted);
    assert.deepEqual(service.fetch(bob), []);
    assert.equal(readFileSync(file).includes(Buffer.from(envelope.ciphertext)), false);
  } finally {
    service?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Signal rejects tampered packets, duplicate decryption and a mismatched pinned identity', async () => {
  const a = new SignalFixture(alice),
    b = new SignalFixture(bob),
    c = new SignalFixture(other);
  await a.connect(b);
  const encrypted = await a.encrypt(b.address, 'DEVELOPMENT_FIXTURE_TAMPER');
  const bytes = Buffer.from(encrypted.ciphertext, 'base64');
  bytes[bytes.length - 1]! ^= 1;
  await assert.rejects(() =>
    b.decrypt(a.address, { ...encrypted, ciphertext: bytes.toString('base64') }),
  );
  assert.equal(await b.decrypt(a.address, encrypted), 'DEVELOPMENT_FIXTURE_TAMPER');
  await assert.rejects(() => b.decrypt(a.address, encrypted));
  const next = await a.encrypt(b.address, 'DEVELOPMENT_FIXTURE_PIN');
  b.identities.set(a.address.toString(), c.identity.publicKey);
  await assert.rejects(() => b.decrypt(a.address, next));
});

test('delivery expiry cannot be extended by retries, and a changed payload conflicts', () => {
  let now = 2_000_000_000_000;
  const db = new DatabaseSync(':memory:'),
    service = new DeliveryStore(db, access, () => now);
  try {
    const envelope = sample(now),
      accepted = service.submit(alice, envelope);
    now += 86400000;
    assert.deepEqual(service.submit(alice, envelope), accepted);
    assert.throws(
      () =>
        service.submit(alice, {
          ...envelope,
          ciphertext: Buffer.alloc(128, 42).toString('base64'),
        }),
      /CONFLICT/,
    );
    now = accepted.expiresAt;
    assert.deepEqual(service.fetch(bob), []);
    assert.throws(() => service.submit(alice, envelope), /EXPIRED/);
    assert.equal(
      (db.prepare('SELECT count(*) AS count FROM delivery_receipts').get() as { count: number })
        .count,
      0,
    );
  } finally {
    service.close();
  }
});

test('blocking cancels pending content and cannot be changed by another device; unlink cleans spool and routing records', () => {
  const db = new DatabaseSync(':memory:'),
    service = new DeliveryStore(db, access);
  try {
    service.submit(alice, sample());
    service.block(bob, alice, true);
    service.block(other, alice, false);
    assert.deepEqual(service.fetch(bob), []);
    assert.throws(() => service.submit(alice, sample()), /UNAVAILABLE/);
    assert.throws(() => service.submit(unknown, sample()), /UNAUTHORIZED/);
    service.block(bob, alice, false);
    service.submit(alice, sample());
    service.unlink(alice);
    assert.deepEqual(service.fetch(bob), []);
    assert.equal(
      (db.prepare('SELECT count(*) AS count FROM delivery_receipts').get() as { count: number })
        .count,
      0,
    );
  } finally {
    service.close();
  }
});
