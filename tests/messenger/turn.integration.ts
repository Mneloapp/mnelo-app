import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createKeys, sign } from '../../src/messenger/crypto';
import { phoneProofPayload, type PhoneCommand } from '../../src/messenger/phone-protocol';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { fixtureSms } from '../../identity/verification';
import { turnIssuer } from '../../identity/turn';
import { deviceIceConfiguration } from '../../src/messenger/ice-client';

test('TURN credentials require a registered signed device, are rate limited and never unlink it', async () => {
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const secret = randomBytes(32).toString('hex');
  const now = 1_800_000_000_000;
  const service = new PhoneService(
    registry,
    fixtureSms(true),
    () => now,
    undefined,
    turnIssuer(secret, 'relay-dev.mnelo.com', () => now),
  );
  const own = createKeys(randomBytes);
  const execute = (command: PhoneCommand) => {
    const { nonce } = service.challenge(own.key, 'test');
    return service.execute(
      {
        key: own.key,
        nonce,
        command,
        signature: sign(own.secret, phoneProofPayload(own.key, nonce, command)),
      },
      'test',
    );
  };
  try {
    await assert.rejects(execute({ action: 'ice' }), /PHONE_REGISTRATION_REQUIRED/);
    registry.bind(registry.index('+12025550101'), own.key, true, now);
    const response = await execute({ action: 'ice' });
    assert.ok(response.ice);
    assert.equal(response.ice.expires, now + 3600_000);
    const server = response.ice.iceServers[0]!;
    assert.equal(
      server.credential,
      createHmac('sha1', secret).update(server.username).digest('base64'),
    );
    assert.ok(!JSON.stringify(response).includes(own.key));
    assert.ok(!JSON.stringify(response).includes(secret));
    assert.ok(registry.status(own.key));
    for (let i = 1; i < 12; i++) await execute({ action: 'ice' });
    await assert.rejects(execute({ action: 'ice' }), /PHONE_RATE_LIMITED/);
    assert.ok(registry.status(own.key));
    await execute({ action: 'unlink' });
    await assert.rejects(execute({ action: 'ice' }), /PHONE_REGISTRATION_REQUIRED/);
  } finally {
    registry.close();
  }
});

test('TURN cache coalesces requests, refreshes before expiry and never falls back to direct ICE', async () => {
  let now = 1_800_000_000_000,
    requests = 0,
    available = true;
  const issuer = turnIssuer(randomBytes(32).toString('hex'), 'relay-dev.mnelo.com', () => now);
  const own = createKeys(randomBytes);
  const configuration = deviceIceConfiguration(
    {
      async execute(command) {
        assert.deepEqual(command, { action: 'ice' });
        requests++;
        if (!available) throw new Error('TURN_UNAVAILABLE');
        return { ice: issuer.issue(own.key) };
      },
    },
    () => now,
  );
  const [a, b] = await Promise.all([configuration(), configuration()]);
  assert.deepEqual(a, b);
  assert.equal(a.iceTransportPolicy, 'relay');
  assert.equal(requests, 1);
  now += 3301_000;
  available = false;
  await assert.rejects(configuration(), /TURN_UNAVAILABLE/);
  available = true;
  const refreshed = await configuration();
  assert.notEqual(refreshed.iceServers![0]!.username, a.iceServers![0]!.username);
  assert.equal(requests, 3);
});

test('TURN client rejects stale, far future, malformed and non-TURN configuration', async () => {
  let now = 1_800_000_000_000;
  const issuer = turnIssuer(randomBytes(32).toString('hex'), 'relay-dev.mnelo.com', () => now);
  const own = createKeys(randomBytes);
  const original = issuer.issue(own.key);
  for (const ice of [
    { ...original, expires: now - 1 },
    { ...original, expires: now + 7200_000 },
    { ...original, iceServers: [{ ...original.iceServers[0]!, urls: ['stun:example.com'] }] },
    { ...original, iceServers: [{ ...original.iceServers[0]!, credential: 'bad' }] },
  ])
    await assert.rejects(
      deviceIceConfiguration(
        {
          async execute() {
            return { ice };
          },
        },
        () => now,
      )(),
    );
  now += 5000;
});
