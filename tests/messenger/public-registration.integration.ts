import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { PublicSmsGuard, publicRegistrationPolicy } from '../../identity/public-registration';
import { hostedIdentityConfiguration } from '../../identity/hosted-configuration';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { IdentityAccess, ReviewAccess } from '../../identity/review-access';
import { reviewPhones } from '../../src/messenger/review-account';
import { createKeys, sign } from '../../src/messenger/crypto';
import { phoneProofPayload, type PhoneCommand } from '../../src/messenger/phone-protocol';

const policy = {
  version: 1,
  smsBudget: 'uncapped',
  allowedCountries: ['US', 'GB'],
  blockedPrefixes: [],
  coverageVerifiedAt: '2026-09-27T00:00:00.000Z',
};
const phone = '+12025550101';
const index = (value: string) => createHash('sha256').update(value).digest('hex');
const keys = createKeys(randomBytes);
const request = (number = phone, source = '192.0.2.1', key = keys.key) => ({
  phone: number,
  source,
  key,
});
const syntheticPhone = (i: number) =>
  `+1${i < 98 ? '202' : '415'}55501${String(i < 98 ? i : i - 98).padStart(2, '0')}`;

test('public mode requires explicit verified coverage, uncapped policy and combined routing', () => {
  for (const value of [
    {},
    { ...policy, smsBudget: 100 },
    { ...policy, allowedCountries: [] },
    { ...policy, allowedCountries: ['ALL'] },
    { ...policy, allowedCountries: ['US', 'US'] },
    { ...policy, blockedPrefixes: ['*'] },
    { ...policy, blockedPrefixes: ['+44', '+44'] },
    { ...policy, coverageVerifiedAt: 'unknown' },
    { ...policy, monthlyLimit: 50 },
  ])
    assert.throws(
      () => publicRegistrationPolicy(value),
      /PUBLIC_REGISTRATION_CONFIGURATION_INVALID/,
    );
  assert.equal(publicRegistrationPolicy(policy).smsBudget, 'uncapped');
  const env = {
    MNELO_HOSTED_IDENTITY: 'public',
    MNELO_COMBINED_RELAY: '1',
    MNELO_PUBLIC_REGISTRATION_POLICY_FILE: '/etc/mnelo/public-registration.json',
  };
  assert.equal(hostedIdentityConfiguration(env).publicRegistration, true);
  for (const invalid of [
    { ...env, MNELO_ALLOWED_PHONE_INDICES: 'a'.repeat(64) },
    { ...env, MNELO_PUBLIC_REGISTRATION_POLICY_FILE: '' },
    { ...env, MNELO_PUBLIC_REGISTRATION_POLICY_FILE: './relative.json' },
    { ...env, MNELO_COMBINED_RELAY: undefined },
    { ...env, MNELO_HOSTED_IDENTITY: 'development' },
    { ...env, MNELO_HOSTED_IDENTITY: 'unknown' },
  ])
    assert.throws(() => hostedIdentityConfiguration(invalid), /CONFIGURATION_INVALID/);
  assert.equal(
    hostedIdentityConfiguration({ MNELO_HOSTED_IDENTITY: 'development' }).publicRegistration,
    false,
  );
  assert.equal(hostedIdentityConfiguration({}).hosted, false);
});

test('destination checks distinguish countries sharing a prefix and apply explicit blocked prefixes', () => {
  const db = new DatabaseSync(':memory:');
  const guard = new PublicSmsGuard(
    db,
    { ...policy, blockedPrefixes: ['+447700'] },
    randomBytes(32),
  );
  try {
    for (const number of ['+14165550101', '+447700900123', '+995555123456', 'bad-number'])
      assert.throws(
        () => guard.reserve(index(number), request(number)),
        /PHONE_PROVIDER_UNAVAILABLE/,
      );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sms_abuse_limits').get()!.n, 0);
    guard.reserve(index(phone), request());
    assert.throws(() => guard.reserve(index(phone)), /PHONE_REQUEST_FAILED/);
  } finally {
    guard.close();
  }
});

test('number limits persist across connections/restart, include failed sends, and expire without storing identifiers', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mnelo-public-sms-'));
  const path = join(folder, 'abuse.db');
  const secret = randomBytes(32);
  let now = 1_800_000_000_000;
  const first = new PublicSmsGuard(new DatabaseSync(path), policy, secret, () => now);
  first.reserve(index(phone), request());
  first.close();
  const db = new DatabaseSync(path);
  const second = new PublicSmsGuard(db, policy, secret, () => now);
  const third = new PublicSmsGuard(new DatabaseSync(path), policy, secret, () => now);
  try {
    assert.throws(() => second.reserve(index(phone), request()), /PHONE_RATE_LIMITED/);
    now += 60000;
    third.reserve(index(phone), request());
    assert.throws(() => second.reserve(index(phone), request()), /PHONE_RATE_LIMITED/);
    const rows = JSON.stringify(db.prepare('SELECT * FROM sms_abuse_limits').all());
    for (const raw of [phone, keys.key, '192.0.2.1', index(phone)])
      assert.equal(rows.includes(raw), false);
    now += 86400000;
    third.prune();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sms_abuse_limits').get()!.n, 0);
    second.reserve(index('+12025550102'), request('+12025550102'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sms_abuse_limits').get()!.n, 5);
    now--;
    assert.throws(
      () => third.reserve(index('+12025550103'), request('+12025550103')),
      /PHONE_RATE_LIMITED/,
    );
  } finally {
    second.close();
    third.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('per-number hourly and daily controls survive network/device rotation without imposing a total SMS cap', () => {
  let now = 1_800_000_000_000;
  const guard = new PublicSmsGuard(
    new DatabaseSync(':memory:'),
    policy,
    randomBytes(32),
    () => now,
  );
  const send = () =>
    guard.reserve(index(phone), request(phone, '192.0.2.2', createKeys(randomBytes).key));
  try {
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 5; i++) {
        send();
        now += 60000;
      }
      assert.throws(send, /PHONE_RATE_LIMITED/);
      now += 3600000;
    }
    assert.throws(send, /PHONE_RATE_LIMITED/);
    now += 86400000;
    send();
  } finally {
    guard.close();
  }
});

test('device throttles cannot be bypassed by changing numbers or networks', () => {
  const guard = new PublicSmsGuard(new DatabaseSync(':memory:'), policy, randomBytes(32));
  try {
    for (let i = 0; i < 5; i++)
      guard.reserve(index(syntheticPhone(i)), request(syntheticPhone(i), `192.0.2.${i + 1}`));
    assert.throws(
      () => guard.reserve(index(syntheticPhone(5)), request(syntheticPhone(5), '198.51.100.1')),
      /PHONE_RATE_LIMITED/,
    );
  } finally {
    guard.close();
  }
});

test('source throttles cover IPv6 /64 rotation and rollback all other reservations on rejection', () => {
  const db = new DatabaseSync(':memory:');
  const guard = new PublicSmsGuard(db, policy, randomBytes(32));
  try {
    for (let i = 0; i < 100; i++)
      guard.reserve(
        index(syntheticPhone(i)),
        request(syntheticPhone(i), `2001:db8:1234:5678::${i + 1}`, createKeys(randomBytes).key),
      );
    const next = request(
      syntheticPhone(100),
      '2001:db8:1234:5678:ffff::1',
      createKeys(randomBytes).key,
    );
    const before = db.prepare('SELECT COUNT(*) AS n FROM sms_abuse_limits').get()!.n;
    assert.throws(() => guard.reserve(index(next.phone), next), /PHONE_RATE_LIMITED/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sms_abuse_limits').get()!.n, before);
    guard.reserve(index(next.phone), { ...next, source: '2001:db8:1234:5679::1' });
    assert.throws(
      () => guard.reserve(index(syntheticPhone(101)), request(syntheticPhone(101), 'untrusted')),
      /PHONE_REQUEST_FAILED/,
    );
  } finally {
    guard.close();
  }
});

test('IPv4 and mapped IPv6 spellings share the same persistent source counter', () => {
  const db = new DatabaseSync(':memory:');
  const guard = new PublicSmsGuard(db, policy, randomBytes(32));
  try {
    guard.reserve(index(phone), request(phone, '192.0.2.1'));
    guard.reserve(index(syntheticPhone(2)), request(syntheticPhone(2), '::ffff:192.0.2.1'));
    const rows = db.prepare("SELECT used FROM sms_abuse_limits WHERE scope='source-hour'").all();
    assert.deepEqual(
      rows.map((row) => row.used),
      [2],
    );
  } finally {
    guard.close();
  }
});

test('public service accepts more than the old global budget while keeping OTP binding and review isolation', async () => {
  const now = 1_800_000_000_000;
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const guard = new PublicSmsGuard(
    new DatabaseSync(':memory:'),
    policy,
    randomBytes(32),
    () => now,
  );
  const reserved = new Set(reviewPhones.map((p) => registry.index(p)));
  const secrets = ['a'.repeat(32), 'b'.repeat(32)];
  const review = new ReviewAccess(
    {
      createdAt: now - 1000,
      expiresAt: now + 86400000,
      accounts: reviewPhones.map((p, i) => ({ phone: p, secretHash: index(secrets[i]!) })),
    },
    (p) => registry.index(p),
    () => now,
  );
  const access = new IdentityAccess(registry, (i) => !reserved.has(i), review, 'public');
  let sent = 0;
  const service = new PhoneService(
    registry,
    {
      testOnly: true,
      async send() {
        sent++;
        return 'synthetic';
      },
      async check(_id, code) {
        return code === '864209';
      },
    },
    () => now,
    guard,
    undefined,
    undefined,
    access,
  );
  const execute = (
    who: ReturnType<typeof createKeys>,
    command: PhoneCommand,
    source = '192.0.2.1',
  ) => {
    const { nonce } = service.challenge(who.key, source);
    return service.execute(
      {
        key: who.key,
        nonce,
        command,
        signature: sign(who.secret, phoneProofPayload(who.key, nonce, command)),
      },
      source,
    );
  };
  try {
    const realKeys = [];
    for (let i = 0; i < 120; i++) {
      const who = createKeys(randomBytes);
      realKeys.push(who);
      const source = i < 60 ? '192.0.2.1' : '198.51.100.1';
      const result = await execute(who, { action: 'send', phone: syntheticPhone(i) }, source);
      assert.equal(access.scope(who.key), null, 'sending an OTP does not register an identity');
      await execute(
        who,
        { action: 'verify', attempt: result.attempt!, code: '864209', discoverable: true },
        source,
      );
      assert.equal(access.scope(who.key), 'public');
    }
    assert.equal(sent, 120, 'no 15/day or 100/hour shared business cap');
    const reviewer = createKeys(randomBytes);
    const result = await execute(reviewer, { action: 'send', phone: reviewPhones[0] });
    assert.equal(sent, 120, 'review access never sends SMS');
    await execute(reviewer, {
      action: 'verify',
      attempt: result.attempt!,
      code: secrets[0]!,
      discoverable: true,
    });
    assert.equal(access.scope(reviewer.key), 'review');
    assert.equal(access.canContact(realKeys[0]!.key, reviewer.key), false);
    assert.equal(access.canContact(realKeys[0]!.key, realKeys[1]!.key), true);
    await assert.rejects(
      execute(realKeys[0]!, { action: 'send', phone: reviewPhones[0] }),
      /PHONE_PROVIDER_UNAVAILABLE/,
    );
  } finally {
    guard.close();
    registry.close();
  }
});

test('provider failure consumes durable reservation and service restart cannot retry within the cooldown', async () => {
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const guard = new PublicSmsGuard(new DatabaseSync(':memory:'), policy, randomBytes(32));
  let sent = 0;
  const provider = {
    testOnly: true,
    async send(): Promise<string> {
      sent++;
      throw new Error('PHONE_PROVIDER_UNAVAILABLE');
    },
    async check() {
      return false;
    },
  };
  const send = (service: PhoneService) => {
    const source = '192.0.2.1';
    const { nonce } = service.challenge(keys.key, source);
    const command = { action: 'send', phone } as const;
    return service.execute(
      {
        key: keys.key,
        nonce,
        command,
        signature: sign(keys.secret, phoneProofPayload(keys.key, nonce, command)),
      },
      source,
    );
  };
  try {
    await assert.rejects(
      send(new PhoneService(registry, provider, Date.now, guard)),
      /PHONE_PROVIDER_UNAVAILABLE/,
    );
    await assert.rejects(
      send(new PhoneService(registry, provider, Date.now, guard)),
      /PHONE_RATE_LIMITED/,
    );
    assert.equal(sent, 1);
  } finally {
    guard.close();
    registry.close();
  }
});
