import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { MediaJournal } from '../../src/messenger/delivery/media-journal';
import { MediaTransfer } from '../../src/messenger/delivery/media-transfer';
import { MEDIA_CHUNK_BYTES } from '../../src/messenger/delivery/media-schema';
import { DELIVERY_TTL_MS } from '../../src/messenger/delivery/schema';
import { createKeys } from '../../src/messenger/crypto';
import { PhoneClient } from '../../src/messenger/phone-client';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { DeliveryStore } from '../../identity/delivery-store';
import { MediaStore } from '../../identity/media-store';
import { DeliveryService } from '../../identity/delivery-service';
import { SignalDirectory } from '../../identity/signal-directory';
import { fixtureSms } from '../../identity/verification';
import { SignalJournal } from '../../src/messenger/delivery/journal';
import { NodeSignal } from './node-signal';
import { deliveryDatabase } from './delivery-fixture';

test('real signed HTTP media transfers resume after lost responses, yield between chunks, and acknowledge only after local consumption', async () => {
  const a = deliveryDatabase(),
    b = deliveryDatabase(),
    ar = createKeys(randomBytes),
    br = createKeys(randomBytes);
  const aj = new MediaJournal(a.atomic, ar.key, randomBytes, randomUUID),
    bj = new MediaJournal(b.atomic, br.key, randomBytes, randomUUID);
  await aj.initialize();
  await bj.initialize();
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  registry.bind(registry.index('+12025550101'), ar.key, true, Date.now());
  registry.bind(registry.index('+12025550102'), br.key, true, Date.now());
  const access = {
    registered: (key: string) => Boolean(registry.status(key)),
    canContact: () => true,
  };
  const media = new MediaStore(new DatabaseSync(':memory:'), access);
  const service = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), access),
    new SignalDirectory(new DatabaseSync(':memory:')),
    media,
  );
  for (const [fixture, root] of [
    [a, ar],
    [b, br],
  ] as const) {
    const signal = new SignalJournal(fixture.atomic, new NodeSignal(), root),
      keys = await signal.initialize();
    service.directory.publish(root.key, keys, signal.binding(keys));
  }
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
  const url = `http://127.0.0.1:${address.port}`,
    ac = new PhoneClient(url, ar),
    bc = new PhoneClient(url, br);
  let losePut = true,
    loseAck = true,
    puts = 0;
  const flakyUpload: Pick<PhoneClient, 'execute'> = {
    async execute(command) {
      const result = await ac.execute(command);
      if (command.action === 'delivery-blob-put') {
        puts++;
        if (losePut) {
          losePut = false;
          throw new Error('FIXTURE_RESPONSE_LOST');
        }
      }
      return result;
    },
  };
  const flakyDownload: Pick<PhoneClient, 'execute'> = {
    async execute(command) {
      const result = await bc.execute(command);
      if (command.action === 'delivery-blob-ack' && loseAck) {
        loseAck = false;
        throw new Error('FIXTURE_RESPONSE_LOST');
      }
      return result;
    },
  };
  try {
    const plain = randomBytes(MEDIA_CHUNK_BYTES * 3 + 8),
      messageId = randomUUID(),
      createdAt = Date.now();
    const file = {
      name: 'fixture.jpg',
      mime: 'image/jpeg',
      bytes: plain.toString('base64'),
      duration: null,
    };
    const descriptor = await aj.prepare(br.key, messageId, createdAt, file);
    assert.deepEqual(await aj.prepare(br.key, messageId, createdAt, file), descriptor);
    await assert.rejects(
      aj.prepare(br.key, messageId, createdAt, {
        ...file,
        bytes: randomBytes(8).toString('base64'),
      }),
      /CONFLICT/,
    );
    const upload = new MediaTransfer(flakyUpload, aj);
    await assert.rejects(upload.uploadStep(descriptor.blob.id), /RESPONSE_LOST/);
    assert.equal(await upload.uploadStep(descriptor.blob.id), false);
    assert.equal(puts, 3); // A new step sends at most two missing chunks.
    assert.equal(await new MediaTransfer(ac, aj).uploadStep(descriptor.blob.id), true);
    assert.equal((await aj.upload(descriptor.blob.id))?.cipher.length, 0);
    const download = new MediaTransfer(flakyDownload, bj);
    assert.throws(() => download.downloadStep('c'.repeat(64), descriptor), /UNAUTHORIZED/);
    assert.equal(await download.downloadStep(ar.key, descriptor), false);
    b.failCommit();
    await assert.rejects(download.downloadStep(ar.key, descriptor), /COMMIT_FAILED/);
    assert.equal(await new MediaTransfer(bc, bj).downloadStep(ar.key, descriptor), true);
    assert.deepEqual(Buffer.from(await bj.plaintext(ar.key, descriptor.blob.id)), plain);
    assert.deepEqual(await bj.acknowledgements(), []);
    // History commit belongs to the consumer; the downloader cannot acknowledge it early.
    await bj.consumed(ar.key, descriptor.blob.id);
    await assert.rejects(download.acknowledge(), /RESPONSE_LOST/);
    assert.equal((await bj.acknowledgements()).length, 1);
    assert.throws(() => media.get(br.key, ar.key, descriptor.blob.id, 0), /UNAVAILABLE/);
    await download.acknowledge();
    assert.equal((await bj.acknowledgements()).length, 0);
    assert.equal(await download.downloadStep(ar.key, descriptor), true);
    assert.equal((await bj.parts(ar.key, descriptor.blob.id)).length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.close();
    registry.close();
    a.sql.close();
    b.sql.close();
  }
});

test('expired partial downloads release their bounded slots and local chunks; old outgoing attachment retries cannot reset retention', async () => {
  let now = 2_000_000_000_000;
  const a = deliveryDatabase(),
    b = deliveryDatabase(),
    own = 'a'.repeat(64),
    peer = 'b'.repeat(64);
  const aj = new MediaJournal(a.atomic, own, randomBytes, randomUUID, () => now),
    bj = new MediaJournal(b.atomic, peer, randomBytes, randomUUID, () => now);
  try {
    await aj.initialize();
    await bj.initialize();
    const createdAt = now,
      file = {
        name: 'fixture.bin',
        mime: 'application/octet-stream',
        bytes: randomBytes(8).toString('base64'),
        duration: null,
      };
    const descriptor = await aj.prepare(peer, randomUUID(), createdAt, file);
    await bj.beginDownload(descriptor);
    const cipher = (await aj.upload(descriptor.blob.id))!.cipher;
    await bj.put(own, descriptor.blob.id, 0, Buffer.from(cipher).toString('base64'));
    now += DELIVERY_TTL_MS;
    await bj.prune();
    await aj.prune();
    assert.equal(await bj.download(own, descriptor.blob.id), null);
    assert.deepEqual(await bj.parts(own, descriptor.blob.id), []);
    assert.throws(() => bj.beginDownload(descriptor), /EXPIRED/);
    assert.throws(() => aj.prepare(peer, randomUUID(), createdAt, file), /EXPIRED/);
  } finally {
    a.sql.close();
    b.sql.close();
  }
});
