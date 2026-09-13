import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MediaStore } from '../../identity/media-store';
import {
  encryptMedia,
  decryptMedia,
  bytesToBase64,
  base64ToBytes,
} from '../../src/messenger/delivery/media-crypto';
import { MEDIA_CHUNK_BYTES } from '../../src/messenger/delivery/media-schema';
import { DELIVERY_TTL_MS } from '../../src/messenger/delivery/schema';
const a = 'a'.repeat(64),
  b = 'b'.repeat(64),
  c = 'c'.repeat(64),
  unknown = 'd'.repeat(64);
const access = { registered: (key: string) => [a, b, c].includes(key), canContact: () => true };
function fixture(createdAt = Date.now()) {
  const plain = Buffer.concat([
    Buffer.from('FICTIONAL_PRIVATE_ATTACHMENT_DO_NOT_UPLOAD_PLAINTEXT'),
    randomBytes(MEDIA_CHUNK_BYTES + 91),
  ]);
  return {
    plain,
    ...encryptMedia(plain, { owner: a, recipient: b, id: randomUUID(), createdAt }, randomBytes),
  };
}
function upload(store: MediaStore, value: ReturnType<typeof fixture>) {
  const { blob } = value.descriptor;
  store.begin(a, blob);
  for (let part = 0; part < blob.parts; part++)
    store.put(
      a,
      blob.id,
      part,
      bytesToBase64(
        value.encrypted.subarray(part * MEDIA_CHUNK_BYTES, (part + 1) * MEDIA_CHUNK_BYTES),
      ),
    );
  store.finish(a, blob.id);
}
test('encrypted attachment persists across server restart, requires its recipient and disappears after durable recipient ack', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mnelo-cipher-media-')),
    file = join(dir, 'objects.db');
  let store = new MediaStore(new DatabaseSync(file), access);
  try {
    const value = fixture(),
      { blob } = value.descriptor;
    upload(store, value);
    assert.equal(
      readFileSync(file).includes(
        Buffer.from('FICTIONAL_PRIVATE_ATTACHMENT_DO_NOT_UPLOAD_PLAINTEXT'),
      ),
      false,
    );
    assert.equal(readFileSync(file).includes(Buffer.from(value.descriptor.key)), false);
    store.close();
    store = new MediaStore(new DatabaseSync(file), access);
    assert.throws(() => store.get(c, a, blob.id, 0), /UNAVAILABLE/);
    assert.throws(() => store.get(unknown, a, blob.id, 0), /UNAUTHORIZED/);
    assert.throws(() => store.get(a, a, blob.id, 0), /UNAVAILABLE/);
    store.acknowledge(c, a, blob.id);
    const cipher = Buffer.concat(
      Array.from({ length: blob.parts }, (_, part) =>
        base64ToBytes(store.get(b, a, blob.id, part)),
      ),
    );
    assert.deepEqual(Buffer.from(decryptMedia(value.descriptor, cipher, b)), value.plain);
    store.acknowledge(b, a, blob.id);
    assert.throws(() => store.get(b, a, blob.id, 0), /UNAVAILABLE/);
    // Lost uploader responses do not resurrect an object already acknowledged.
    assert.deepEqual(store.begin(a, blob), { present: [], complete: true });
    assert.equal(readFileSync(file).includes(Buffer.from(value.encrypted.subarray(0, 64))), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('partial uploads resume idempotently but cannot be read early, resized, overwritten or extended after expiry', () => {
  let now = 2_000_000_000_000;
  const store = new MediaStore(new DatabaseSync(':memory:'), access, () => now);
  try {
    const value = fixture(now),
      { blob } = value.descriptor;
    store.begin(a, blob);
    const first = bytesToBase64(value.encrypted.subarray(0, MEDIA_CHUNK_BYTES));
    store.put(a, blob.id, 0, first);
    store.put(a, blob.id, 0, first);
    assert.deepEqual(store.begin(a, blob), { present: [0], complete: false });
    assert.throws(() => store.finish(a, blob.id), /INCOMPLETE/);
    assert.throws(() => store.get(b, a, blob.id, 0), /UNAVAILABLE/);
    assert.throws(() => store.put(c, blob.id, 0, first), /UNAVAILABLE/);
    assert.throws(
      () => store.put(a, blob.id, 0, bytesToBase64(randomBytes(MEDIA_CHUNK_BYTES))),
      /CONFLICT/,
    );
    assert.throws(() => store.put(a, blob.id, 1, first), /SIZE_INVALID/);
    assert.throws(() => store.begin(a, { ...blob, digest: '0'.repeat(64) }), /CONFLICT/);
    now += DELIVERY_TTL_MS;
    store.prune();
    assert.throws(() => store.begin(a, blob), /EXPIRED/);
  } finally {
    store.close();
  }
});
test('AES-GCM rejects a wrong content key, wrong descriptor identity, altered object and wrong receiving device', () => {
  const value = fixture();
  assert.throws(() =>
    decryptMedia({ ...value.descriptor, key: randomBytes(32).toString('hex') }, value.encrypted, b),
  );
  assert.throws(() => decryptMedia({ ...value.descriptor, owner: c }, value.encrypted, b));
  assert.throws(() =>
    decryptMedia(
      { ...value.descriptor, blob: { ...value.descriptor.blob, id: randomUUID() } },
      value.encrypted,
      b,
    ),
  );
  assert.throws(() => decryptMedia(value.descriptor, value.encrypted, c), /INTEGRITY_INVALID/);
  const damaged = new Uint8Array(value.encrypted);
  damaged[0]! ^= 1;
  assert.throws(() => decryptMedia(value.descriptor, damaged, b), /INTEGRITY_INVALID/);
});
test('blocking and account unlink purge pending attachment objects in both directions', () => {
  const store = new MediaStore(new DatabaseSync(':memory:'), access);
  try {
    const value = fixture();
    upload(store, value);
    store.block(b, a);
    assert.throws(() => store.get(b, a, value.descriptor.blob.id, 0), /UNAVAILABLE/);
    const second = fixture();
    upload(store, second);
    store.unlink(b);
    assert.throws(() => store.get(b, a, second.descriptor.blob.id, 0), /UNAVAILABLE/);
  } finally {
    store.close();
  }
});
test('declared ciphertext reservations enforce capacity before chunks arrive and retries do not double-charge storage', () => {
  const store = new MediaStore(new DatabaseSync(':memory:'), access);
  try {
    const blob = {
      id: randomUUID(),
      recipient: b,
      createdAt: Date.now(),
      size: 10 * 1024 * 1024,
      parts: 80,
      digest: '0'.repeat(64),
    };
    store.begin(a, blob);
    store.begin(a, blob);
    store.begin(a, { ...blob, id: randomUUID() });
    store.begin(c, { ...blob, id: randomUUID() });
    assert.throws(() => store.begin(a, { ...blob, id: randomUUID() }), /CAPACITY/);
    assert.throws(() => store.begin(a, { ...blob, size: 1 }), /./);
    assert.throws(() => store.begin(a, { ...blob, recipient: unknown }), /UNAVAILABLE/);
  } finally {
    store.close();
  }
});
