import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { IdentityAccess, ReviewAccess } from '../../identity/review-access';
import { turnIssuer } from '../../identity/turn';
import { DevelopmentSmsGuard } from '../../identity/development-guard';
import { WakeRegistry } from '../../notifications/registry';
import { WakeService } from '../../notifications/service';
import { startRelay } from '../../relay/server';
import { createKeys, sign } from '../../src/messenger/crypto';
import { phoneProofPayload, type PhoneCommand } from '../../src/messenger/phone-protocol';
import { authenticationPayload, signSignal } from '../../src/messenger/signaling';
import { reviewPhones } from '../../src/messenger/review-account';

function fixture() {
  let now = Date.now();
  const createdAt = now;
  const secrets = [randomBytes(16).toString('hex'), randomBytes(16).toString('hex')];
  const config = {
    createdAt,
    expiresAt: now + 86400000,
    accounts: reviewPhones.map((phone, i) => ({
      phone,
      secretHash: createHash('sha256').update(secrets[i]!).digest('hex'),
    })),
  };
  const db = new DatabaseSync(':memory:');
  const registry = new PhoneRegistry(db, randomBytes(32));
  const budget = new DatabaseSync(':memory:');
  const realPhones = ['+12025550101', '+12025550102']; // fictional stand-ins for real cohort
  const guard = new DevelopmentSmsGuard(
    budget,
    realPhones.map((p) => registry.index(p)).join(','),
    () => now,
  );
  const review = new ReviewAccess(
    config,
    (p) => registry.index(p),
    () => now,
  );
  const access = new IdentityAccess(registry, (index) => guard.admits(index), review);
  const routes = new WakeRegistry(new DatabaseSync(':memory:'));
  const delivered: string[] = [];
  const wake = new WakeService(
    routes,
    {
      async send(route) {
        delivered.push(route.token);
        return { accepted: true };
      },
    },
    () => now,
    (a, b) => access.canContact(a, b),
  );
  let sends = 0,
    checks = 0;
  const service = new PhoneService(
    registry,
    {
      testOnly: false,
      async send() {
        sends++;
        return randomUUID();
      },
      async check(_id, code) {
        checks++;
        return code === '123456';
      },
    },
    () => now,
    guard,
    turnIssuer(randomBytes(32).toString('hex'), 'turn.example.test', () => now),
    wake,
    access,
  );
  const keys = [
    createKeys(randomBytes),
    createKeys(randomBytes),
    createKeys(randomBytes),
    createKeys(randomBytes),
  ];
  const run = (who: (typeof keys)[number], command: PhoneCommand) => {
    const { nonce } = service.challenge(who.key, who.key);
    return service.execute(
      {
        key: who.key,
        nonce,
        command,
        signature: sign(who.secret, phoneProofPayload(who.key, nonce, command)),
      },
      who.key,
    );
  };
  const enroll = async (which: number, reviewer: boolean) => {
    const who = keys[which]!;
    const phone = reviewer ? reviewPhones[which - 2]! : realPhones[which]!;
    const sent = await run(who, { action: 'send', phone });
    await run(who, {
      action: 'verify',
      attempt: sent.attempt!,
      code: reviewer ? secrets[which - 2]! : '123456',
      discoverable: true,
    });
    return sent;
  };
  return {
    config,
    review,
    registry,
    db,
    budget,
    guard,
    access,
    routes,
    service,
    wake,
    keys,
    run,
    enroll,
    realPhones,
    secrets,
    delivered,
    counts: () => ({ sends, checks }),
    advance: (ms: number) => {
      now += ms;
    },
    close() {
      routes.close();
      guard.close();
      registry.close();
    },
  };
}

test('review configuration rejects real numbers, duplicate credentials and unbounded expiry', () => {
  const f = fixture();
  try {
    for (const config of [
      { ...f.config, expiresAt: f.config.createdAt + 15 * 86400000 },
      { ...f.config, expiresAt: f.config.createdAt },
      { ...f.config, accounts: [f.config.accounts[0], f.config.accounts[0]] },
      { ...f.config, accounts: f.config.accounts.map((a) => ({ ...a, phone: '+995555123456' })) },
      {
        ...f.config,
        accounts: f.config.accounts.map((a) => ({
          ...a,
          secretHash: f.config.accounts[0]!.secretHash,
        })),
      },
    ])
      assert.throws(() => new ReviewAccess(config, (p) => f.registry.index(p)));
    assert.equal(f.review.check(f.registry.index(reviewPhones[0]), '864209'), false);
  } finally {
    f.close();
  }
});
test('review enrollment uses expiring per-account 128-bit keys, sends no SMS and cannot reuse a proof attempt', async () => {
  const f = fixture();
  try {
    const who = f.keys[2]!;
    const sent = await f.run(who, { action: 'send', phone: reviewPhones[0] });
    assert.equal(sent.reviewAccount, true);
    assert.equal(sent.testOnly, true);
    assert.deepEqual(f.counts(), { sends: 0, checks: 0 });
    assert.equal(f.budget.prepare('SELECT count(*) AS n FROM sms_budgets').get()!.n, 0);
    for (const code of ['864209', f.secrets[1]!])
      await assert.rejects(
        f.run(who, { action: 'verify', attempt: sent.attempt!, code, discoverable: true }),
        /PHONE_CODE_INVALID/,
      );
    await assert.rejects(
      f.run(f.keys[3]!, {
        action: 'verify',
        attempt: sent.attempt!,
        code: f.secrets[0]!,
        discoverable: true,
      }),
      /PHONE_CODE_EXPIRED/,
    );
    await f.run(who, {
      action: 'verify',
      attempt: sent.attempt!,
      code: f.secrets[0]!,
      discoverable: true,
    });
    await assert.rejects(
      f.run(who, {
        action: 'verify',
        attempt: sent.attempt!,
        code: f.secrets[0]!,
        discoverable: true,
      }),
      /PHONE_CODE_EXPIRED/,
    );
    assert.equal(f.access.scope(who.key), 'review');
    assert.deepEqual(f.counts(), { sends: 0, checks: 0 });
  } finally {
    f.close();
  }
});
test('real enrollment still calls its admitted SMS provider; a review key is never forwarded as SMS OTP', async () => {
  const f = fixture();
  try {
    const sent = await f.run(f.keys[0]!, { action: 'send', phone: f.realPhones[0]! });
    assert.equal(sent.reviewAccount, undefined);
    assert.equal(sent.testOnly, false);
    await assert.rejects(
      f.run(f.keys[0]!, {
        action: 'verify',
        attempt: sent.attempt!,
        code: f.secrets[0]!,
        discoverable: true,
      }),
      /PHONE_CODE_INVALID/,
    );
    assert.deepEqual(f.counts(), { sends: 1, checks: 0 });
    await f.run(f.keys[0]!, {
      action: 'verify',
      attempt: sent.attempt!,
      code: '123456',
      discoverable: true,
    });
    assert.equal(f.access.scope(f.keys[0]!.key), 'development');
    await assert.rejects(
      f.run(f.keys[1]!, { action: 'send', phone: '+12025550103' }),
      /PHONE_PROVIDER_UNAVAILABLE/,
    );
    assert.deepEqual(f.counts(), { sends: 1, checks: 1 });
  } finally {
    f.close();
  }
});
test('lookup and active enrollment cannot cross cohorts in either direction', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 4; i++) await f.enroll(i, i >= 2);
    for (const [a, b, phone] of [
      [0, 2, reviewPhones[0]],
      [2, 0, f.realPhones[0]],
    ] as const) {
      assert.deepEqual(await f.run(f.keys[a]!, { action: 'lookup', phone: phone! }), { key: null });
      assert.equal(f.access.canContact(f.keys[a]!.key, f.keys[b]!.key), false);
      await assert.rejects(
        f.run(f.keys[a]!, { action: 'send', phone: phone! }),
        /PHONE_PROVIDER_UNAVAILABLE/,
      );
    }
    assert.deepEqual(await f.run(f.keys[2]!, { action: 'lookup', phone: reviewPhones[1] }), {
      key: f.keys[3]!.key,
    });
    assert.deepEqual(await f.run(f.keys[0]!, { action: 'lookup', phone: f.realPhones[1]! }), {
      key: f.keys[1]!.key,
    });
    assert.equal(f.access.scope(createKeys(randomBytes).key), null);
  } finally {
    f.close();
  }
});
test('review credentials cannot replace a previously pinned review identity', async () => {
  const f = fixture();
  try {
    await f.enroll(2, true);
    f.advance(61000);
    const sent = await f.run(f.keys[3]!, { action: 'send', phone: reviewPhones[0] });
    await assert.rejects(
      f.run(f.keys[3]!, {
        action: 'verify',
        attempt: sent.attempt!,
        code: f.secrets[0]!,
        discoverable: true,
      }),
      /IDENTITY_RECOVERY_REQUIRED/,
    );
    assert.equal(f.registry.lookup(f.registry.index(reviewPhones[0])), f.keys[2]!.key);
  } finally {
    f.close();
  }
});
test('review attempts enforce five checks, expiry and configuration revocation', async () => {
  const f = fixture();
  try {
    const sent = await f.run(f.keys[2]!, { action: 'send', phone: reviewPhones[0] });
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        f.run(f.keys[2]!, {
          action: 'verify',
          attempt: sent.attempt!,
          code: '000000',
          discoverable: true,
        }),
        /PHONE_CODE_INVALID/,
      );
    await assert.rejects(
      f.run(f.keys[2]!, {
        action: 'verify',
        attempt: sent.attempt!,
        code: f.secrets[0]!,
        discoverable: true,
      }),
      /PHONE_RATE_LIMITED/,
    );
    f.advance(61000);
    await f.enroll(3, true);
    f.advance(86400000);
    assert.equal(f.access.scope(f.keys[3]!.key), null);
    assert.deepEqual(await f.run(f.keys[3]!, { action: 'status' }), {
      registered: false,
      discoverable: false,
    });
    for (const command of [
      { action: 'ice' },
      { action: 'lookup', phone: reviewPhones[0] },
      { action: 'wake-grant', capability: randomBytes(32).toString('hex') },
    ] as PhoneCommand[])
      await assert.rejects(f.run(f.keys[3]!, command), /PHONE_REGISTRATION_REQUIRED/);
    await assert.rejects(
      f.run(f.keys[2]!, { action: 'send', phone: reviewPhones[0] }),
      /PHONE_PROVIDER_UNAVAILABLE/,
    );
    assert.equal(
      new IdentityAccess(f.registry, (i) => f.guard.admits(i)).scope(f.keys[3]!.key),
      null,
    );
  } finally {
    f.close();
  }
});
test('a cross-cohort wake capability cannot trigger an alert or incoming call', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 4; i++) await f.enroll(i, i >= 2);
    const caps: string[] = [];
    for (let i = 0; i < 4; i++) {
      const key = f.keys[i]!;
      const capability = randomBytes(32).toString('hex');
      caps.push(capability);
      for (const channel of ['alert', 'voip'] as const)
        await f.run(key, {
          action: 'push-register',
          registration: {
            platform: 'ios',
            environment: 'production',
            channel,
            token: randomBytes(32).toString('hex'),
          },
        });
      await f.run(key, { action: 'wake-grant', capability });
    }
    for (const [a, b] of [
      [0, 2],
      [2, 0],
    ])
      for (const kind of ['message', 'call'] as const)
        await f.run(f.keys[a!]!, {
          action: 'wake',
          capability: caps[b!]!,
          event:
            kind === 'call' ? { kind, id: randomUUID(), video: false } : { kind, id: randomUUID() },
        });
    assert.equal(f.delivered.length, 0);
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ])
      await f.run(f.keys[a!]!, {
        action: 'wake',
        capability: caps[b!]!,
        event: { kind: 'message', id: randomUUID() },
      });
    assert.equal(f.delivered.length, 2);
    assert.equal(new Set(f.delivered).size, 2);
  } finally {
    f.close();
  }
});
test('real WebSocket auth, presence and signed message/call offers enforce cohort boundaries', async () => {
  const f = fixture();
  const relay = startRelay(0, f.access);
  const sockets: WebSocket[] = [];
  const next = async (s: WebSocket) =>
    JSON.parse((await once(s, 'message', { signal: AbortSignal.timeout(5000) }))[0].toString());
  try {
    for (let i = 0; i < 4; i++) await f.enroll(i, i >= 2);
    await once(relay.server, 'listening');
    const address = relay.server.address();
    assert.ok(address && typeof address === 'object');
    const connect = async (key: ReturnType<typeof createKeys>, allowed = true) => {
      const s = new WebSocket(`ws://127.0.0.1:${address.port}`);
      sockets.push(s);
      const c = await next(s);
      const response = allowed ? next(s) : once(s, 'close', { signal: AbortSignal.timeout(5000) });
      s.send(
        JSON.stringify({
          type: 'auth',
          key: key.key,
          signature: sign(key.secret, authenticationPayload(key.key, c.nonce)),
        }),
      );
      const r = await response;
      if (allowed) assert.equal(r.type, 'ready');
      else assert.equal(r[0], 1008);
      return s;
    };
    await connect(createKeys(randomBytes), false);
    const peers = [];
    for (const key of f.keys) peers.push(await connect(key));
    for (const [a, b] of [
      [0, 2],
      [2, 0],
      [0, 1],
      [2, 3],
    ]) {
      const response = next(peers[a!]!);
      peers[a!]!.send(JSON.stringify({ type: 'probe', to: f.keys[b!]!.key }));
      assert.equal((await response).online, a! < 2 === b! < 2);
    }
    for (const purpose of ['message', 'call'] as const)
      for (const [a, b] of [
        [0, 2],
        [2, 0],
        [0, 1],
        [2, 3],
      ]) {
        const cross = a! < 2 !== b! < 2;
        const response = next(peers[cross ? a! : b!]!);
        const envelope = signSignal(f.keys[a!]!.secret, {
          protocol: 'mnelo-dtls-v1',
          from: f.keys[a!]!.key,
          to: f.keys[b!]!.key,
          session: randomUUID(),
          type: 'offer',
          purpose,
          sdp: 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'),
          expires: Date.now() + 60000,
        });
        peers[a!]!.send(JSON.stringify({ type: 'signal', to: f.keys[b!]!.key, envelope }));
        assert.equal((await response).type, cross ? 'unavailable' : 'signal');
      }
    f.advance(86400000);
    const closed = once(peers[2]!, 'close', { signal: AbortSignal.timeout(5000) });
    peers[2]!.send(JSON.stringify({ type: 'probe', to: f.keys[3]!.key }));
    assert.equal((await closed)[0], 1008);
    const presence = next(peers[0]!);
    peers[0]!.send(JSON.stringify({ type: 'probe', to: f.keys[1]!.key }));
    assert.equal((await presence).online, true);
  } finally {
    for (const s of sockets) s.terminate();
    await relay.close();
    f.close();
  }
});
