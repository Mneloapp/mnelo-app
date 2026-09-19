import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { fixtureSms } from '../../identity/verification';
import { createKeys, sign } from '../../src/messenger/crypto';
import { phoneProofPayload, type PhoneCommand } from '../../src/messenger/phone-protocol';
import { deliveryCommand, type DeliveryEnvelope } from '../../src/messenger/delivery/schema';

const alice = 'a'.repeat(64),
  bob = 'b'.repeat(64),
  other = 'c'.repeat(64);

test('sync negotiates without changing old status responses, bounds batches and cannot acknowledge another recipient', () => {
  const store = new DeliveryStore(new DatabaseSync(':memory:'), {
    registered: (key) => [alice, bob, other].includes(key),
    canContact: () => true,
  });
  const service = new DeliveryService(store, new SignalDirectory(new DatabaseSync(':memory:')));
  const envelope: DeliveryEnvelope = {
    version: 2,
    id: randomUUID(),
    createdAt: Date.now(),
    recipient: bob,
    type: 3,
    ciphertext: 'AAAA',
  };
  try {
    assert.deepEqual(service.execute(bob, { action: 'delivery-status' }), {
      version: 2,
      availableKeys: 0,
    });
    assert.deepEqual(service.execute(bob, { action: 'delivery-status', capabilities: true }), {
      version: 2,
      availableKeys: 0,
      sync: true,
    });
    store.submit(alice, envelope);
    const sync = {
      action: 'delivery-sync',
      acknowledgements: [{ sender: alice, id: envelope.id }],
      receive: true,
    } as const;
    assert.equal(service.execute(other, sync).inbox!.length, 0);
    assert.equal(store.fetch(bob).length, 1);
    assert.equal(service.execute(bob, sync).inbox!.length, 0);
    assert.equal(store.fetch(bob).length, 0);
    assert.deepEqual(
      service.execute(bob, sync),
      { version: 2, inbox: [] },
      'retry after a lost response is safe',
    );
    assert.equal(
      deliveryCommand.safeParse({
        ...sync,
        acknowledgements: Array(21).fill(sync.acknowledgements[0]),
      }).success,
      false,
    );
    assert.throws(
      () => service.execute('d'.repeat(64), { ...sync, receive: false }),
      /UNAUTHORIZED/,
    );
  } finally {
    service.close();
  }
});

test('unknown identities retain 120 challenges; admitted identities have one bounded interactive budget and unchanged lookup limits', async () => {
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const delivery = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: (key) => Boolean(registry.status(key)),
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
  let now = 0;
  const service = new PhoneService(
    registry,
    fixtureSms(true),
    () => now,
    undefined,
    undefined,
    undefined,
    undefined,
    delivery,
  );
  const unknown = createKeys(randomBytes),
    registered = createKeys(randomBytes);
  registry.bind(registry.index('+12025550101'), registered.key, true, now);
  try {
    for (let n = 0; n < 120; n++) service.challenge(unknown.key, 'unknown-source');
    assert.throws(() => service.challenge(unknown.key, 'another-source'), /PHONE_RATE_LIMITED/);
    // Seed the challenge window, then mint valid proofs just before its rollover.
    // This allows testing the signed aggregate quota independently of that limit.
    service.challenge(registered.key, 'registered-source');
    now = 59999;
    const nonces = Array.from(
      { length: 359 },
      () => service.challenge(registered.key, 'registered-source').nonce,
    );
    now = 60000;
    nonces.push(service.challenge(registered.key, 'registered-source').nonce);
    nonces.push(service.challenge(registered.key, 'registered-source').nonce);
    for (const [index, nonce] of nonces.entries()) {
      const command: PhoneCommand =
        index % 2
          ? { action: 'delivery-sync', acknowledgements: [], receive: true }
          : { action: 'delivery-status', capabilities: true };
      const operation = () =>
        service.execute(
          {
            key: registered.key,
            nonce,
            command,
            signature: sign(registered.secret, phoneProofPayload(registered.key, nonce, command)),
          },
          'registered-source',
        );
      if (index < 360) await operation();
      else
        await assert.rejects(
          operation,
          /PHONE_RATE_LIMITED/,
          'sync and status share the aggregate limit',
        );
    }
    now += 60000;
    for (let n = 0; n <= 30; n++) {
      const command: PhoneCommand = { action: 'lookup', phone: '+12025550102' };
      const { nonce } = service.challenge(registered.key, 'registered-source');
      const operation = () =>
        service.execute(
          {
            key: registered.key,
            nonce,
            command,
            signature: sign(registered.secret, phoneProofPayload(registered.key, nonce, command)),
          },
          'registered-source',
        );
      if (n < 30) await operation();
      else await assert.rejects(operation, /PHONE_RATE_LIMITED/);
    }
  } finally {
    delivery.close();
    registry.close();
  }
});
