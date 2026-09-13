import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { fixtureSms, twilioSms, type SmsVerification } from '../../identity/verification';
import { startPhoneHttp } from '../../identity/http';
import { PhoneClient } from '../../src/messenger/phone-client';
import { createKeys, sign } from '../../src/messenger/crypto';
import {
  phoneProofPayload,
  phoneServiceAddress,
  normalizeInternationalPhone,
  type PhoneCommand,
} from '../../src/messenger/phone-protocol';

const alicePhone = '+12025550101',
  bobPhone = '+12025550102';
function fixture(sms: SmsVerification = fixtureSms(true)) {
  const db = new DatabaseSync(':memory:');
  const registry = new PhoneRegistry(db, randomBytes(32));
  let now = 1_800_000_000_000;
  const service = new PhoneService(registry, sms, () => now);
  const alice = createKeys(randomBytes),
    bob = createKeys(randomBytes);
  const proof = (who: typeof alice, command: PhoneCommand) => {
    const { nonce } = service.challenge(who.key, who.key);
    return {
      key: who.key,
      nonce,
      command,
      signature: sign(who.secret, phoneProofPayload(who.key, nonce, command)),
    };
  };
  const execute = (who: typeof alice, command: PhoneCommand) =>
    service.execute(proof(who, command), who.key);
  const register = async (who: typeof alice, phone: string, discoverable = true) => {
    const sent = await execute(who, { action: 'send', phone });
    return execute(who, { action: 'verify', attempt: sent.attempt!, code: '864209', discoverable });
  };
  return {
    db,
    registry,
    service,
    alice,
    bob,
    proof,
    execute,
    register,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test('phone proof requires OTP before lookup; registry stores only keyed index/public key/privacy/time', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      f.execute(f.alice, { action: 'lookup', phone: bobPhone }),
      /PHONE_REGISTRATION_REQUIRED/,
    );
    const sent = await f.execute(f.alice, { action: 'send', phone: alicePhone });
    assert.equal(sent.testOnly, true);
    await assert.rejects(
      f.execute(f.alice, {
        action: 'verify',
        attempt: sent.attempt!,
        code: '000000',
        discoverable: true,
      }),
      /PHONE_CODE_INVALID/,
    );
    assert.equal(f.registry.status(f.alice.key), undefined);
    await f.execute(f.alice, {
      action: 'verify',
      attempt: sent.attempt!,
      code: '864209',
      discoverable: true,
    });
    await f.register(f.bob, bobPhone);
    assert.deepEqual(await f.execute(f.alice, { action: 'lookup', phone: bobPhone }), {
      key: f.bob.key,
    });
    const rows = f.db.prepare('SELECT * FROM phone_identities').all();
    assert.deepEqual(Object.keys(rows[0]!), [
      'phone_index',
      'public_key',
      'discoverable',
      'verified_at',
    ]);
    assert.ok(!JSON.stringify(rows).includes(alicePhone));
    assert.ok(!JSON.stringify(rows).includes(bobPhone));
    assert.ok(!JSON.stringify(rows).includes(f.alice.secret));
  } finally {
    f.registry.close();
  }
});
test('signed commands cannot be tampered, replayed or used with another identity', async () => {
  const f = fixture();
  try {
    const proof = f.proof(f.alice, { action: 'status' });
    assert.deepEqual(await f.service.execute(proof, 'development'), {
      registered: false,
      discoverable: false,
    });
    await assert.rejects(f.service.execute(proof, 'development'), /PHONE_UNAUTHORIZED/);
    const changed = f.proof(f.alice, { action: 'status' });
    await assert.rejects(
      f.service.execute({ ...changed, command: { action: 'unlink' } }, 'development'),
      /PHONE_UNAUTHORIZED/,
    );
    await assert.rejects(
      f.service.execute(
        { ...f.proof(f.alice, { action: 'status' }), key: f.bob.key },
        'development',
      ),
      /PHONE_UNAUTHORIZED/,
    );
  } finally {
    f.registry.close();
  }
});
test('registered keys survive provider loss and a new service instance without any SMS operation', async () => {
  const f = fixture();
  try {
    await f.register(f.alice, alicePhone);
    await f.register(f.bob, bobPhone);
    let providerCalls = 0;
    const unavailable = async (): Promise<never> => {
      providerCalls++;
      throw new Error('PHONE_PROVIDER_UNAVAILABLE');
    };
    const restarted = new PhoneService(
      f.registry,
      { testOnly: false, send: unavailable, check: unavailable },
      () => 1_800_000_000_000 + 40 * 86400000,
    );
    // Only the restored key is needed; no previous OTP attempt/session survives.
    const restored = { ...f.alice };
    const execute = (command: PhoneCommand) => {
      const { nonce } = restarted.challenge(restored.key, 'returned-device');
      return restarted.execute(
        {
          key: restored.key,
          nonce,
          command,
          signature: sign(restored.secret, phoneProofPayload(restored.key, nonce, command)),
        },
        'returned-device',
      );
    };
    assert.deepEqual(await execute({ action: 'status' }), {
      registered: true,
      discoverable: true,
    });
    assert.deepEqual(await execute({ action: 'lookup', phone: bobPhone }), { key: f.bob.key });
    assert.deepEqual(await execute({ action: 'visibility', discoverable: false }), {
      registered: true,
      discoverable: false,
    });
    assert.deepEqual(await execute({ action: 'status' }), {
      registered: true,
      discoverable: false,
    });
    assert.deepEqual(await execute({ action: 'unlink' }), { ok: true, registered: false });
    assert.equal(providerCalls, 0);
    assert.ok(f.registry.status(f.bob.key));
  } finally {
    f.registry.close();
  }
});
test('hidden and unknown numbers have the same result; unlink removes only the caller mapping', async () => {
  const f = fixture();
  try {
    await f.register(f.alice, alicePhone);
    await f.register(f.bob, bobPhone, false);
    assert.deepEqual(await f.execute(f.alice, { action: 'lookup', phone: bobPhone }), {
      key: null,
    });
    assert.deepEqual(await f.execute(f.alice, { action: 'lookup', phone: '+12025550103' }), {
      key: null,
    });
    await f.execute(f.bob, { action: 'visibility', discoverable: true });
    assert.deepEqual(await f.execute(f.alice, { action: 'lookup', phone: bobPhone }), {
      key: f.bob.key,
    });
    await f.execute(f.bob, { action: 'unlink' });
    assert.deepEqual(await f.execute(f.alice, { action: 'lookup', phone: bobPhone }), {
      key: null,
    });
    assert.ok(f.registry.status(f.alice.key));
  } finally {
    f.registry.close();
  }
});
test('OTP cannot replace an existing encryption identity, and a failed bind preserves both records', async () => {
  const f = fixture();
  try {
    await f.register(f.alice, alicePhone);
    await f.register(f.bob, bobPhone);
    f.advance(61000);
    const sent = await f.execute(f.bob, { action: 'send', phone: alicePhone });
    await assert.rejects(
      f.execute(f.bob, {
        action: 'verify',
        attempt: sent.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /IDENTITY_RECOVERY_REQUIRED/,
    );
    assert.equal(f.registry.lookup(f.registry.index(alicePhone)), f.alice.key);
    assert.equal(f.registry.lookup(f.registry.index(bobPhone)), f.bob.key);
  } finally {
    f.registry.close();
  }
});
test('OTP is bound to requesting device, expires and enforces resend/check budgets', async () => {
  const f = fixture();
  try {
    const sent = await f.execute(f.alice, { action: 'send', phone: alicePhone });
    await assert.rejects(
      f.execute(f.alice, { action: 'send', phone: alicePhone }),
      /PHONE_RATE_LIMITED/,
    );
    await assert.rejects(
      f.execute(f.bob, {
        action: 'verify',
        attempt: sent.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /PHONE_CODE_EXPIRED/,
    );
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        f.execute(f.alice, {
          action: 'verify',
          attempt: sent.attempt!,
          code: '000000',
          discoverable: true,
        }),
        /PHONE_CODE_INVALID/,
      );
    await assert.rejects(
      f.execute(f.alice, {
        action: 'verify',
        attempt: sent.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /PHONE_RATE_LIMITED/,
    );
    f.advance(600001);
    await assert.rejects(
      f.execute(f.alice, {
        action: 'verify',
        attempt: sent.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /PHONE_CODE_EXPIRED/,
    );
  } finally {
    f.registry.close();
  }
});
test('authenticated number enumeration is bounded', async () => {
  const f = fixture();
  try {
    await f.register(f.alice, alicePhone);
    for (let i = 0; i < 30; i++) await f.execute(f.alice, { action: 'lookup', phone: bobPhone });
    await assert.rejects(
      f.execute(f.alice, { action: 'lookup', phone: bobPhone }),
      /PHONE_RATE_LIMITED/,
    );
  } finally {
    f.registry.close();
  }
});
test('a provider-rejected resend preserves the old code but a successful resend replaces it', async () => {
  let sends = 0;
  const f = fixture({
    testOnly: true,
    async send() {
      if (++sends === 2) throw new Error('PHONE_RATE_LIMITED');
      return String(sends);
    },
    async check() {
      return true;
    },
  });
  try {
    const first = await f.execute(f.alice, { action: 'send', phone: alicePhone });
    f.advance(61000);
    await assert.rejects(
      f.execute(f.alice, { action: 'send', phone: alicePhone }),
      /PHONE_RATE_LIMITED/,
    );
    assert.equal(
      (
        await f.execute(f.alice, {
          action: 'verify',
          attempt: first.attempt!,
          code: '864209',
          discoverable: true,
        })
      ).registered,
      true,
    );
    const previous = await f.execute(f.bob, { action: 'send', phone: bobPhone });
    f.advance(61000);
    const replacement = await f.execute(f.bob, { action: 'send', phone: bobPhone });
    await assert.rejects(
      f.execute(f.bob, {
        action: 'verify',
        attempt: previous.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /PHONE_CODE_EXPIRED/,
    );
    assert.equal(
      (
        await f.execute(f.bob, {
          action: 'verify',
          attempt: replacement.attempt!,
          code: '864209',
          discoverable: true,
        })
      ).registered,
      true,
    );
  } finally {
    f.registry.close();
  }
});
test('a device cannot race two sends or approve an old code during a pending replacement', async () => {
  let finish!: (id: string) => void;
  const delayed = new Promise<string>((resolve) => {
    finish = resolve;
  });
  let sends = 0;
  const f = fixture({
    testOnly: true,
    async send() {
      return ++sends === 1 ? 'first' : delayed;
    },
    async check() {
      return true;
    },
  });
  try {
    const first = await f.execute(f.alice, { action: 'send', phone: alicePhone });
    f.advance(61000);
    const pending = f.execute(f.alice, { action: 'send', phone: alicePhone });
    await assert.rejects(
      f.execute(f.alice, { action: 'send', phone: bobPhone }),
      /PHONE_RATE_LIMITED/,
    );
    await assert.rejects(
      f.execute(f.alice, {
        action: 'verify',
        attempt: first.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /PHONE_RATE_LIMITED/,
    );
    finish('replacement');
    const result = await pending;
    assert.equal(sends, 2);
    await assert.rejects(
      f.execute(f.alice, {
        action: 'verify',
        attempt: first.attempt!,
        code: '864209',
        discoverable: true,
      }),
      /PHONE_CODE_EXPIRED/,
    );
    assert.equal(
      (
        await f.execute(f.alice, {
          action: 'verify',
          attempt: result.attempt!,
          code: '864209',
          discoverable: true,
        })
      ).registered,
      true,
    );
  } finally {
    finish('cleanup');
    f.registry.close();
  }
});
test('fixture refuses real numbers/non-local mode; phone API requires secure or loopback addresses', async () => {
  assert.throws(() => fixtureSms(false), /FIXTURE_REQUIRES_LOCAL/);
  await assert.rejects(fixtureSms(true).send('+12025550109'), /FIXTURE_PHONE_REQUIRED/);
  assert.equal(normalizeInternationalPhone('+1 (202) 555-0101'), alicePhone);
  assert.throws(() => normalizeInternationalPhone('2025550101'));
  assert.throws(() => phoneServiceAddress('http://example.com', true));
  assert.throws(() => phoneServiceAddress('https://user:password@example.com', false));
  assert.throws(() => phoneServiceAddress('http://127.0.0.1:8086', false));
  assert.equal(phoneServiceAddress('http://127.0.0.1:8086', true), 'http://127.0.0.1:8086');
});
test('real HTTP client verifies, looks up and receives redacted failures without content APIs', async () => {
  const f = fixture();
  const server = startPhoneHttp(f.service);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const client = new PhoneClient(url, f.alice);
    const sent = await client.execute({ action: 'send', phone: alicePhone });
    await client.execute({
      action: 'verify',
      attempt: sent.attempt!,
      code: '864209',
      discoverable: true,
    });
    assert.deepEqual(await client.execute({ action: 'lookup', phone: alicePhone }), {
      key: f.alice.key,
    });
    const forbidden = await fetch(url + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: alicePhone, privateMessage: 'not accepted' }),
    });
    assert.equal(forbidden.status, 400);
    assert.equal(forbidden.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await forbidden.json(), { code: 'PHONE_REQUEST_FAILED' });
    const cors = await fetch(url + '/challenge', {
      method: 'POST',
      headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: f.alice.key }),
    });
    assert.equal(cors.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    f.registry.close();
  }
});
test('Twilio adapter keeps credentials server-side and requires approved status', async () => {
  const requests: { url: string; body: string }[] = [];
  const provider = twilioSms(
    {
      account: 'AC' + 'a'.repeat(32),
      token: 'development-test-only-token',
      service: 'VA' + 'b'.repeat(32),
    },
    async (url, init) => {
      requests.push({ url: String(url), body: String(init?.body) });
      return new Response(
        JSON.stringify({
          sid: 'VE' + 'c'.repeat(32),
          status: requests.length === 1 ? 'pending' : 'approved',
        }),
        { status: 200 },
      );
    },
  );
  assert.equal(provider.testOnly, false);
  const sid = await provider.send(alicePhone);
  assert.equal(await provider.check(sid, '123456'), true);
  assert.ok(requests[0]?.url.endsWith('/Verifications'));
  assert.equal(new URLSearchParams(requests[0]?.body).get('Channel'), 'sms');
  assert.ok(requests[1]?.url.endsWith('/VerificationCheck'));
  assert.ok(requests[1]?.body.includes('VerificationSid=VE'));
  assert.ok(!requests[1]?.body.includes('To='));
});
