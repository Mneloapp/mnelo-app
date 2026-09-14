import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, generateKeyPairSync, verify } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ApplePushProvider, ApplePushEnvironments, apnsPayload } from '../../notifications/apns';
import { FirebasePushProvider } from '../../notifications/fcm';
import { WakeRegistry } from '../../notifications/registry';
import { WakeService } from '../../notifications/service';
import { PhoneService } from '../../identity/service';
import { PhoneRegistry } from '../../identity/registry';
import { fixtureSms } from '../../identity/verification';
import { createKeys, sign } from '../../src/messenger/crypto';
import {
  phoneProofPayload,
  phoneCommand,
  type PhoneCommand,
} from '../../src/messenger/phone-protocol';
const token = () => randomBytes(32).toString('hex');
test('confirming an unchanged push route does not exhaust token-rotation limits', async () => {
  const routes = new WakeRegistry(new DatabaseSync(':memory:'));
  let now = Date.now();
  const wake = new WakeService(
    routes,
    {
      async send() {
        return { accepted: true };
      },
    },
    () => now,
  );
  const owner = createKeys(randomBytes).key;
  const registration = {
    platform: 'ios' as const,
    channel: 'alert' as const,
    environment: 'production' as const,
    token: token(),
  };
  try {
    for (let i = 0; i < 50; i++) {
      now++;
      await wake.execute(owner, { action: 'push-register', registration });
    }
    assert.equal(routes.ownerRoute(owner, 'alert')?.updated, now);
    for (let i = 0; i < 29; i++) {
      registration.token = token();
      await wake.execute(owner, { action: 'push-register', registration });
    }
    await assert.rejects(
      wake.execute(owner, {
        action: 'push-register',
        registration: { ...registration, token: token() },
      }),
      /PUSH_RATE_LIMITED/,
    );
    await wake.execute(owner, { action: 'push-register', registration });
    const stranger = createKeys(randomBytes).key;
    await assert.rejects(
      wake.execute(stranger, { action: 'push-register', registration }),
      /PUSH_REGISTRATION_CONFLICT/,
    );
    wake.disable(owner);
    await assert.rejects(
      wake.execute(owner, { action: 'push-register', registration }),
      /PUSH_RATE_LIMITED/,
      'revoked routes are not treated as unchanged',
    );
  } finally {
    routes.close();
  }
});
test('APNs uses a valid ES256 provider JWT, correct topics, zero retention and no private content', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const requests: { origin: string; headers: Record<string, string>; body: string }[] = [];
  const now = 1800000000000;
  const provider = new ApplePushProvider(
    'AAAAAAAAAA',
    'BBBBBBBBBB',
    pem,
    async (origin, headers, body) => {
      requests.push({ origin, headers, body });
      return { status: 200, body: '' };
    },
    () => now,
  );
  const id = randomUUID();
  assert.deepEqual(
    await provider.send(
      { channel: 'voip', environment: 'production', token: token() },
      { kind: 'call', id, video: true },
    ),
    { accepted: true },
  );
  await provider.send(
    { channel: 'alert', environment: 'sandbox', token: token() },
    { kind: 'message', id: randomUUID() },
  );
  for (const request of requests) {
    const jwt = request.headers.authorization!.slice(7).split('.');
    assert.equal(
      verify(
        'sha256',
        Buffer.from(jwt[0] + '.' + jwt[1]),
        { key: pair.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(jwt[2]!, 'base64url'),
      ),
      true,
    );
    assert.deepEqual(JSON.parse(Buffer.from(jwt[1]!, 'base64url').toString()), {
      iss: 'AAAAAAAAAA',
      iat: now / 1000,
    });
    assert.equal(request.headers['apns-expiration'], '0');
    assert.ok(!request.body.includes(pem));
    assert.ok(!/phone|public_key|secret|sender|attachment/.test(request.body));
  }
  assert.equal(requests[0]!.headers['apns-topic'], 'com.mnelo.messenger.voip');
  assert.equal(requests[0]!.headers['apns-push-type'], 'voip');
  assert.equal(requests[1]!.headers['apns-topic'], 'com.mnelo.messenger');
  assert.equal(requests[1]!.origin, 'https://api.sandbox.push.apple.com');
  assert.deepEqual(JSON.parse(requests[0]!.body), {
    aps: {},
    mnelo: { v: 1, kind: 'call', id, video: true, expires: now + 60000 },
  });
  assert.ok(JSON.stringify(apnsPayload({ kind: 'message', id })).length < 512);
  assert.equal(JSON.parse(requests[1]!.body).aps['mutable-content'], 1);
  assert.equal(JSON.parse(requests[0]!.body).aps['mutable-content'], undefined);
  const expiresAt = now + 120000;
  await provider.send(
    { channel: 'alert', environment: 'sandbox', token: token() },
    { kind: 'message', id },
    { expiresAt, missedCall: true },
  );
  assert.equal(requests.at(-1)!.headers['apns-expiration'], String(expiresAt / 1000));
  assert.equal(JSON.parse(requests.at(-1)!.body).aps.alert.body, 'Missed call');
  await provider.send(
    { channel: 'voip', environment: 'production', token: token() },
    { kind: 'call', id, video: false },
    { expiresAt: now + 10000 },
  );
  assert.equal(requests.at(-1)!.headers['apns-expiration'], '0');
  assert.equal(JSON.parse(requests.at(-1)!.body).mnelo.expires, now + 10000);
});
test('push route ownership, revocation, expiry, token rotation and unlink fail closed', async () => {
  const db = new DatabaseSync(':memory:');
  const routes = new WakeRegistry(db);
  let now = 1800000000000;
  const sent: string[] = [];
  const wake = new WakeService(
    routes,
    {
      async send(route) {
        sent.push(route.token);
        return { accepted: true };
      },
    },
    () => now,
  );
  const a = createKeys(randomBytes),
    b = createKeys(randomBytes),
    stranger = createKeys(randomBytes);
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const service = new PhoneService(
    registry,
    fixtureSms(true),
    () => now,
    undefined,
    undefined,
    wake,
  );
  const run = (who: typeof a, command: PhoneCommand) => {
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
  const registration = {
    platform: 'ios' as const,
    channel: 'alert' as const,
    environment: 'sandbox' as const,
    token: token(),
  };
  try {
    await assert.rejects(
      run(stranger, { action: 'push-register', registration }),
      /PHONE_REGISTRATION_REQUIRED/,
    );
    registry.bind(registry.index('+12025550101'), a.key, true, now);
    registry.bind(registry.index('+12025550102'), b.key, true, now);
    await run(b, { action: 'push-register', registration });
    await assert.rejects(
      run(a, { action: 'push-register', registration }),
      /PUSH_REGISTRATION_CONFLICT/,
    );
    const capability = token();
    await run(b, { action: 'wake-grant', capability });
    await assert.rejects(
      run(a, { action: 'wake-grant', capability }),
      /PUSH_REGISTRATION_CONFLICT/,
    );
    await run(a, { action: 'wake-revoke', capability }); // cannot revoke B's capability
    await run(a, {
      action: 'wake',
      capability: token(),
      event: { kind: 'message', id: randomUUID() },
    });
    assert.equal(sent.length, 0);
    const event = { kind: 'message' as const, id: randomUUID() };
    await run(a, { action: 'wake', capability, event });
    await run(a, { action: 'wake', capability, event });
    assert.deepEqual(sent, [registration.token]);
    await run(b, { action: 'wake-revoke', capability });
    await run(a, { action: 'wake', capability, event: { kind: 'message', id: randomUUID() } });
    assert.equal(sent.length, 1);
    await run(b, { action: 'wake-grant', capability });
    now += 31 * 86400000;
    await run(a, { action: 'wake', capability, event: { kind: 'message', id: randomUUID() } });
    assert.equal(sent.length, 1);
    await run(b, { action: 'wake-grant', capability });
    const next = { ...registration, token: token() };
    await run(b, { action: 'push-register', registration: next });
    routes.invalidate({ ...registration, owner: b.key }, now); // stale provider feedback cannot remove replacement
    await run(a, { action: 'wake', capability, event: { kind: 'message', id: randomUUID() } });
    assert.equal(sent.at(-1), next.token);
    await run(b, { action: 'unlink' });
    assert.equal(db.prepare('SELECT count(*) AS n FROM push_routes').get()!.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM wake_grants').get()!.n, 0);
  } finally {
    registry.close();
    routes.close();
  }
});
test('push requests reject message bodies, arbitrary recipient tokens, providers and malformed calls', () => {
  const base = {
    action: 'wake',
    capability: token(),
    event: { kind: 'message', id: randomUUID() },
  };
  for (const invalid of [
    { ...base, token: token() },
    { ...base, event: { ...base.event, body: 'private' } },
    { ...base, event: { kind: 'call', id: randomUUID(), video: 'yes' } },
    {
      action: 'push-register',
      registration: { channel: 'alert', environment: 'https://example.com', token: token() },
    },
  ])
    assert.equal(phoneCommand.safeParse(invalid).success, false);
});
test('call pushes are separately rate limited and duplicate events are not delivered twice', async () => {
  const registry = new WakeRegistry(new DatabaseSync(':memory:'));
  let sends = 0;
  const now = 1800000000000;
  const wake = new WakeService(
    registry,
    {
      async send() {
        sends++;
        return { accepted: true };
      },
    },
    () => now,
  );
  const capability = token();
  registry.register('receiver', { channel: 'voip', environment: 'sandbox', token: token() }, now);
  registry.grant('receiver', capability, now);
  try {
    for (let i = 0; i < 6; i++)
      await wake.execute('sender', {
        action: 'wake',
        capability,
        event: { kind: 'call', id: randomUUID(), video: false },
      });
    await assert.rejects(
      wake.execute('sender', {
        action: 'wake',
        capability,
        event: { kind: 'call', id: randomUUID(), video: false },
      }),
      /PUSH_RATE_LIMITED/,
    );
    assert.equal(sends, 6);
  } finally {
    registry.close();
  }
});

test('environment-scoped Apple keys never fall back across sandbox and TestFlight', async () => {
  const calls: string[] = [];
  const provider = new ApplePushEnvironments({
    sandbox: {
      async send() {
        calls.push('sandbox');
        return { accepted: true };
      },
    },
  });
  await provider.send(
    { channel: 'alert', environment: 'sandbox', token: token() },
    { kind: 'message', id: randomUUID() },
  );
  assert.throws(
    () =>
      provider.send(
        { channel: 'alert', environment: 'production', token: token() },
        { kind: 'message', id: randomUUID() },
      ),
    /PUSH_UNAVAILABLE/,
  );
  assert.deepEqual(calls, ['sandbox']);
});
test('FCM authenticates server-side with RS256 and sends only zero-retention opaque wake events', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = 1800000000000;
  const requests: { url: string; init: RequestInit }[] = [];
  const provider = new FirebasePushProvider(
    {
      type: 'service_account',
      project_id: 'mnelo-fixture',
      client_email: 'fixture@mnelo-fixture.iam.gserviceaccount.com',
      private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
    (async (url, init) => {
      requests.push({ url: String(url), init: init! });
      if (String(url).includes('oauth2'))
        return new Response(
          JSON.stringify({ access_token: 'development-fixture-token', expires_in: 3600 }),
        );
      return new Response(JSON.stringify({ name: 'fixture' }));
    }) as typeof fetch,
    () => now,
  );
  const registration = {
    platform: 'android' as const,
    channel: 'voip' as const,
    environment: 'production' as const,
    token: 'fixture-fcm-token-'.repeat(3),
  };
  const event = { kind: 'call' as const, id: randomUUID(), video: false };
  assert.deepEqual(await provider.send(registration, event), { accepted: true });
  await provider.send(registration, { ...event, id: randomUUID() });
  assert.equal(requests.length, 3, 'reuse short-lived OAuth credentials');
  assert.equal(requests[0]!.url, 'https://oauth2.googleapis.com/token');
  const assertion = new URLSearchParams(String(requests[0]!.init.body))
    .get('assertion')!
    .split('.');
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(assertion[0] + '.' + assertion[1]),
      pair.publicKey,
      Buffer.from(assertion[2]!, 'base64url'),
    ),
    true,
  );
  const claim = JSON.parse(Buffer.from(assertion[1]!, 'base64url').toString());
  assert.equal(claim.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(claim.exp - claim.iat, 3600);
  assert.equal(
    requests[1]!.url,
    'https://fcm.googleapis.com/v1/projects/mnelo-fixture/messages:send',
  );
  const body = JSON.parse(String(requests[1]!.init.body));
  assert.deepEqual(body.message.android, {
    priority: 'HIGH',
    ttl: '0s',
    restricted_package_name: 'com.mnelo.messenger',
  });
  assert.deepEqual(JSON.parse(body.message.data.mnelo), { v: 1, ...event, expires: now + 60000 });
  assert.equal(body.message.notification, undefined);
  assert.equal(requests[1]!.init.redirect, 'error');
  await provider.send(
    { ...registration, channel: 'alert' },
    { kind: 'message', id: randomUUID() },
    { expiresAt: now + 30 * 86400000, missedCall: true },
  );
  const queued = JSON.parse(String(requests.at(-1)!.init.body));
  assert.equal(queued.message.android.ttl, '2419200s');
  assert.equal(JSON.parse(queued.message.data.mnelo).reason, 'missed-call');
  assert.equal(queued.message.notification, undefined);
  await assert.rejects(
    provider.send({ ...registration, environment: 'sandbox' }, event),
    /PUSH_CHANNEL_INVALID/,
  );
});

test('an unconfigured platform cannot register routes or claim background readiness', async () => {
  const routes = new WakeRegistry(new DatabaseSync(':memory:'));
  const wake = new WakeService(routes, {
    available: () => false,
    async send() {
      throw new Error('Unexpected send');
    },
  });
  try {
    await assert.rejects(
      wake.execute('owner', {
        action: 'push-register',
        registration: {
          platform: 'android',
          channel: 'alert',
          environment: 'production',
          token: 'fixture-token-'.repeat(4),
        },
      }),
      /PUSH_UNAVAILABLE/,
    );
  } finally {
    routes.close();
  }
});
