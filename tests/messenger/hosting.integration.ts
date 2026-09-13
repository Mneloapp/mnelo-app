import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { DevelopmentSmsGuard } from '../../identity/development-guard';
import { PhoneService } from '../../identity/service';
import { PhoneRegistry } from '../../identity/registry';
import { startPhoneHttp } from '../../identity/http';
import { createKeys, sign } from '../../src/messenger/crypto';
import { phoneProofPayload } from '../../src/messenger/phone-protocol';

const index = 'ab'.repeat(32);
test('hosted SMS admission rejects empty, malformed, duplicate or oversized tester lists', () => {
  for (const value of [
    '',
    'phone-number',
    index + ',' + index,
    Array.from({ length: 51 }, (_, i) => i.toString(16).padStart(64, '0')).join(','),
  ]) {
    const db = new DatabaseSync(':memory:');
    try {
      assert.throws(
        () => new DevelopmentSmsGuard(db, value),
        /IDENTITY_ADMISSION_CONFIGURATION_INVALID/,
      );
    } finally {
      db.close();
    }
  }
});
test('unadmitted phone indexes neither consume budget nor reach the SMS provider', async () => {
  const db = new DatabaseSync(':memory:');
  const guard = new DevelopmentSmsGuard(db, index);
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  let calls = 0;
  const service = new PhoneService(
    registry,
    {
      testOnly: false,
      send: async () => {
        calls++;
        return 'unexpected';
      },
      check: async () => false,
    },
    Date.now,
    guard,
  );
  try {
    const keys = createKeys(randomBytes),
      command = { action: 'send', phone: '+12025550101' } as const;
    const { nonce } = service.challenge(keys.key, '198.51.100.1');
    await assert.rejects(
      service.execute(
        {
          key: keys.key,
          nonce,
          command,
          signature: sign(keys.secret, phoneProofPayload(keys.key, nonce, command)),
        },
        '198.51.100.1',
      ),
      /PHONE_PROVIDER_UNAVAILABLE/,
    );
    assert.equal(calls, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sms_budgets').get()!.count, 0);
  } finally {
    guard.close();
    registry.close();
  }
});
test('global SMS reservations survive database close/reopen and cannot be reset by another worker', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mnelo-sms-budget-'));
  const path = join(directory, 'budget.db');
  try {
    const first = new DevelopmentSmsGuard(new DatabaseSync(path), index, () => 1000);
    for (let i = 0; i < 9; i++) first.reserve(index);
    first.close();
    const second = new DevelopmentSmsGuard(new DatabaseSync(path), index, () => 2000);
    const third = new DevelopmentSmsGuard(new DatabaseSync(path), index, () => 2000);
    try {
      second.reserve(index);
      assert.throws(() => third.reserve(index), /PHONE_RATE_LIMITED/);
      assert.throws(() => second.reserve(index), /PHONE_RATE_LIMITED/);
    } finally {
      second.close();
      third.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('daily SMS cap is atomic across hourly renewal and clock rollback fails closed', () => {
  const db = new DatabaseSync(':memory:');
  let now = 1000;
  const guard = new DevelopmentSmsGuard(db, index, () => now);
  try {
    for (let i = 0; i < 10; i++) guard.reserve(index);
    now += 3600000;
    for (let i = 0; i < 5; i++) guard.reserve(index);
    assert.throws(() => guard.reserve(index), /PHONE_RATE_LIMITED/);
    assert.equal(db.prepare("SELECT used FROM sms_budgets WHERE scope='hour'").get()!.used, 5);
    now = 999;
    assert.throws(() => guard.reserve(index), /PHONE_RATE_LIMITED/);
    now = 86401000;
    guard.reserve(index);
    assert.equal(db.prepare("SELECT used FROM sms_budgets WHERE scope='day'").get()!.used, 1);
    assert.deepEqual(
      db
        .prepare('PRAGMA table_info(sms_budgets)')
        .all()
        .map((row) => row.name),
      ['scope', 'started_at', 'used'],
    );
  } finally {
    guard.close();
  }
});
async function httpFixture(trusted: boolean) {
  const sources: string[] = [];
  const stub = {
    challenge: (_key: string, source: string) => {
      sources.push(source);
      return { nonce: 'synthetic' };
    },
  } as unknown as PhoneService;
  const server = startPhoneHttp(stub, 0, trusted);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    sources,
    send: (headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:${address.port}/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ key: index }),
      }),
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
test('local phone endpoint ignores client-supplied forwarding headers', async () => {
  const f = await httpFixture(false);
  try {
    assert.equal(
      (await f.send({ 'x-mnelo-client-ip': '198.51.100.8', 'x-forwarded-for': '198.51.100.9' }))
        .status,
      200,
    );
    assert.deepEqual(f.sources, ['127.0.0.1']);
  } finally {
    await f.close();
  }
});
test('hosted phone endpoint rejects missing, malformed and duplicate proxy addresses', async () => {
  const f = await httpFixture(true);
  try {
    for (const headers of [
      {},
      { 'x-forwarded-for': '198.51.100.8' },
      { 'x-mnelo-client-ip': 'not-an-ip' },
      { 'x-mnelo-client-ip': '198.51.100.8, 198.51.100.9' },
    ]) {
      const response = await f.send(headers);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: 'PHONE_REQUEST_FAILED' });
    }
    assert.deepEqual(f.sources, []);
  } finally {
    await f.close();
  }
});
test('hosted phone endpoint separates proxy client addresses and canonicalizes IPv6', async () => {
  const f = await httpFixture(true);
  try {
    for (const value of ['198.51.100.8', '198.51.100.9', '2001:0db8:0000:0000:0000:0000:0000:0001'])
      assert.equal((await f.send({ 'x-mnelo-client-ip': value })).status, 200);
    assert.deepEqual(f.sources, ['198.51.100.8', '198.51.100.9', '2001:db8::1']);
  } finally {
    await f.close();
  }
});
