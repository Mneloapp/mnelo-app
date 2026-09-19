import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DeviceMessenger } from '../../src/messenger/engine';
import { ApplicationDelivery } from '../../src/messenger/delivery/application';
import { DeliveredCallControl } from '../../src/messenger/delivery/call-control';
import { IntentMessageSession } from '../../src/messenger/intent-message-session';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { fixtureSms } from '../../identity/verification';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';
import { PhoneClient } from '../../src/messenger/phone-client';

async function fixture(cold = false) {
  let now = Date.now();
  const a = deliveryDatabase(),
    b = deliveryDatabase();
  const ae = new DeviceMessenger(a.db, randomBytes, randomUUID, () => now);
  const be = new DeviceMessenger(b.db, randomBytes, randomUUID, () => now);
  await ae.initialize();
  await be.initialize();
  const ar = await ae.createIdentity('Fixture Alice'),
    br = await be.createIdentity('Fixture Bob');
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const service = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), {
      registered: (key) => Boolean(registry.status(key)),
      canContact: () => true,
    }),
    new SignalDirectory(new DatabaseSync(':memory:')),
  );
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
  const url = `http://127.0.0.1:${address.port}`;
  const previous = {
    service: process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
    env: process.env.EXPO_PUBLIC_APP_ENV,
  };
  process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL = url;
  process.env.EXPO_PUBLIC_APP_ENV = 'local';
  for (const [engine, root, phone] of [
    [ae, ar, '+12025550101'],
    [be, br, '+12025550102'],
  ] as const) {
    registry.bind(registry.index(phone), root.key, true, now);
    await engine.completePhoneEnrollment(
      { phone, service: url, testOnly: true, verifiedAt: now },
      root.key,
    );
  }
  const chat = await ae.trustPhoneContact({
    key: br.key,
    phone: '+12025550102',
    name: 'Saved peer',
  });
  await be.trustPhoneContact({ key: ar.key, phone: '+12025550101', name: 'Alice' });
  const app = new ApplicationDelivery(
    ae,
    new PhoneClient(url, ar),
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async () => null,
    () => now,
    true,
  );
  const bob = new ApplicationDelivery(
    be,
    new PhoneClient(url, br),
    new NodeSignal(),
    randomBytes,
    randomUUID,
    () => {},
    async () => null,
    () => now,
    true,
  );
  await app.start();
  await app.pump.tick();
  app.pump.stop();
  await bob.start();
  await bob.pump.tick();
  const callId = randomUUID();
  await bob.sendDurable(ar.key, { type: 'call', action: 'invite', id: callId, media: 'voice' });
  await bob.pump.tick();
  bob.pump.stop();
  const keys = await bob.journal.initialize();
  const { oneTime: _oneTime, ...identity } = keys;
  await app.journal.pin({ ...identity, owner: br.key, signature: bob.journal.binding(keys) });
  const invite = service.store.fetch(ar.key)[0]!;
  if (!cold) {
    await app.journal.receive(invite);
    await new DeliveredCallControl(ae, { receive: async () => {} }, () => now).receive(
      br.key,
      { type: 'call', action: 'invite', id: callId, media: 'voice' },
      { createdAt: now },
    );
  }
  const actions: string[] = [],
    wires: string[] = [];
  let offline = false,
    loseResponse = false;
  let intercept:
    ((input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>) | undefined;
  const sessions: IntentMessageSession[] = [];
  const host = {
    db: { ...a.db, async close() {} },
    random: randomBytes,
    uuid: randomUUID,
    signal: new NodeSignal(),
    request: (async (input, init) => {
      if (intercept) return intercept(input, init);
      if (offline) throw new Error('FIXTURE_OFFLINE');
      const body = JSON.parse(String(init?.body));
      if (body.command) {
        actions.push(body.command.action);
        if (body.command.envelope) wires.push(JSON.stringify(body.command.envelope));
      }
      const response = await fetch(input, init);
      if (loseResponse && body.command?.action === 'delivery-submit') {
        loseResponse = false;
        throw new Error('FIXTURE_RESPONSE_LOST');
      }
      return response;
    }) as typeof fetch,
  };
  const session = () => {
    const value = new IntentMessageSession(host, () => now);
    sessions.push(value);
    return value;
  };
  const hint = (key: string) => createHash('sha256').update(key).digest('hex');
  return {
    a,
    b,
    ae,
    be,
    ar,
    br,
    app,
    bob,
    service,
    chat,
    callId,
    invite,
    actions,
    wires,
    session,
    input: { handle: '+12025550102' },
    selector: {
      handle: '+12025550102',
      callId,
      callerHint: hint(br.key),
      accountHint: hint(ar.key),
      receivedAt: now,
    },
    offline: (value: boolean) => {
      offline = value;
    },
    lose: () => {
      loseResponse = true;
    },
    advance: (ms: number) => {
      now += ms;
    },
    intercept: (value: typeof intercept) => {
      intercept = value;
    },
    async close() {
      for (const session of sessions) await session.close();
      app.stop();
      bob.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.close();
      registry.close();
      a.sql.close();
      b.sql.close();
      if (previous.service === undefined) delete process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL;
      else process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL = previous.service;
      if (previous.env === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
      else process.env.EXPO_PUBLIC_APP_ENV = previous.env;
    },
  };
}

test('system intent replies once through real Signal and signed HTTP; changing OS request identifiers cannot duplicate a reply', async () => {
  const f = await fixture();
  try {
    const first = f.session(),
      binding = await first.resolve(f.input);
    assert.equal(binding.callId, f.callId);
    assert.equal(binding.peer, f.br.key);
    const request = { ...binding, content: 'I will call you back.', identifier: 'first-os-intent' };
    assert.deepEqual(await first.confirm(request), { ready: true });
    const sent = await first.send(request);
    assert.equal(sent.committed, true);
    assert.equal(sent.uploaded, true);
    const guessed = createHash('sha256')
      .update(
        JSON.stringify([
          'mnelo-call-reply-v1',
          binding.account,
          binding.peer,
          binding.callId,
          request.content,
        ]),
      )
      .digest('hex');
    const publicFingerprint = `${guessed.slice(0, 8)}-${guessed.slice(8, 12)}-5${guessed.slice(13, 16)}-8${guessed.slice(17, 20)}-${guessed.slice(20, 32)}`;
    assert.notEqual(
      sent.messageId,
      publicFingerprint,
      'public routing metadata cannot identify a guessed common reply through its UUID',
    );
    await first.close();
    const duplicate = await f.session().send({ ...request, identifier: 'new-os-intent' });
    assert.deepEqual(duplicate, sent);
    assert.deepEqual(
      f.actions,
      ['delivery-submit'],
      'no inbox, key publication, identity or metadata lookup on warm reply',
    );
    assert.equal(f.wires.length, 1);
    assert.ok(!f.wires[0]!.includes(request.content));
    assert.equal(
      f.a.sql.prepare("SELECT count(*) AS count FROM messages WHERE kind='text'").get()!.count,
      1,
    );
    const reply = f.service.store.fetch(f.br.key)[0]!;
    await f.bob.journal.receive(reply);
    assert.equal(JSON.parse((await f.bob.journal.inbox())[0]!.body).packet.body, request.content);
  } finally {
    await f.close();
  }
});

test('offline and lost-response retries keep one durable message and identical encrypted event; native close aborts a pending request', async () => {
  const f = await fixture();
  try {
    const first = f.session(),
      binding = await first.resolve(f.input);
    const request = { ...binding, content: 'Later, please.' };
    f.offline(true);
    const pending = await first.send(request);
    assert.equal(pending.committed, true);
    assert.equal(pending.uploaded, false);
    await first.close();
    f.offline(false);
    f.lose();
    const second = await f.session().send(request);
    assert.deepEqual(second, pending);
    const third = await f.session().send(request);
    assert.equal(third.messageId, pending.messageId);
    assert.equal(third.uploaded, true);
    assert.equal(f.wires.length, 2);
    assert.equal(f.wires[0], f.wires[1]);
    assert.equal(f.service.store.fetch(f.br.key).length, 1);
    let started!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.intercept(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          started();
          init?.signal?.addEventListener('abort', () => reject(new Error('ABORTED')), {
            once: true,
          });
        }),
    );
    const last = f.session();
    const operation = last.send({ ...request, content: 'Another explicit reply.' });
    await inFlight;
    await last.close();
    assert.equal((await operation).uploaded, false);
    await assert.rejects(last.resolve(f.input), /CLOSED/);
  } finally {
    await f.close();
  }
});

test('intent account, exact phone, blocked peer, call direction/outcome and expiry are rechecked before sending', async () => {
  const f = await fixture();
  try {
    const session = f.session(),
      binding = await session.resolve(f.input);
    await assert.rejects(session.resolve({ ...f.input, handle: 'Saved peer' }));
    await assert.rejects(
      session.confirm({ ...binding, account: 'a'.repeat(64), content: 'No' }),
      /ACCOUNT_CHANGED/,
    );
    await assert.rejects(
      session.confirm({ ...binding, peer: 'b'.repeat(64), content: 'No' }),
      /RECIPIENT_UNAVAILABLE/,
    );
    await assert.rejects(
      session.confirm({ ...binding, callId: randomUUID(), content: 'No' }),
      /CALL_UNAVAILABLE/,
    );
    await f.ae.block(f.br.key);
    await assert.rejects(session.send({ ...binding, content: 'No' }), /RECIPIENT_UNAVAILABLE/);
    await f.ae.block(f.br.key, false);
    await f.ae.recordCall(f.chat, f.callId, f.br.key, 'voice', 'ended', 'incoming');
    await assert.rejects(session.send({ ...binding, content: 'No' }), /CALL_UNAVAILABLE/);
    f.a.sql.prepare("UPDATE messages SET body='voice:outgoing:declined' WHERE id=?").run(f.callId);
    await assert.rejects(session.resolve(f.input), /CALL_UNAVAILABLE/);
    f.a.sql.prepare("UPDATE messages SET body='voice:incoming:declined' WHERE id=?").run(f.callId);
    assert.equal((await session.resolve(f.input)).callId, f.callId);
    f.advance(120001);
    await assert.rejects(session.send({ ...binding, content: 'No' }), /CALL_UNAVAILABLE/);
    assert.deepEqual(f.actions, []);
    assert.equal(
      f.a.sql.prepare("SELECT count(*) AS count FROM messages WHERE kind='text'").get()!.count,
      0,
    );
  } finally {
    await f.close();
  }
});

test('cold intent decrypts only the exact authenticated call selected by the scoped native hint and leaves all ciphertext unacknowledged', async () => {
  const f = await fixture(true);
  try {
    const session = f.session();
    await assert.rejects(
      session.resolve({ ...f.input, selector: { ...f.selector, accountHint: 'a'.repeat(64) } }),
      /CALL_UNAVAILABLE/,
    );
    await assert.rejects(
      session.resolve({ ...f.input, selector: { ...f.selector, callerHint: 'b'.repeat(64) } }),
      /CALL_UNAVAILABLE/,
    );
    await assert.rejects(
      session.resolve({
        ...f.input,
        selector: { ...f.selector, receivedAt: f.selector.receivedAt - 120001 },
      }),
      /CALL_UNAVAILABLE/,
    );
    assert.deepEqual(f.actions, []);
    const binding = await session.resolve({
      ...f.input,
      selector: { ...f.selector, receivedAt: f.selector.receivedAt - 0.25 },
    });
    assert.equal(binding.callId, f.callId);
    assert.deepEqual(f.actions, ['delivery-inbox']);
    assert.equal(
      f.service.store.fetch(f.ar.key).length,
      1,
      'extension never ACKs the recovered invite',
    );
    assert.equal(
      f.a.sql.prepare('SELECT applied FROM signal_inbox WHERE id=?').get(f.invite.id)!.applied,
      0,
    );
    assert.equal((await session.send({ ...binding, content: 'In a meeting.' })).uploaded, true);
    assert.deepEqual(f.actions, ['delivery-inbox', 'delivery-submit']);
  } finally {
    await f.close();
  }
});

test('cold hint whose authenticated payload is not that incoming call cannot authorize a reply or lose the decrypted message', async () => {
  const f = await fixture(true);
  try {
    // The selector remains only a hint even if its call UUID matches transport metadata.
    f.service.store.acknowledge(f.ar.key, f.br.key, f.invite.id);
    const forgedCall = randomUUID(),
      wireId = randomUUID();
    await f.bob.journal.enqueue(
      f.ar.key,
      wireId,
      JSON.stringify({
        version: 2,
        phone: f.input.handle,
        name: 'Bob',
        packet: { type: 'call', action: 'accept', id: forgedCall, media: 'voice' },
      }),
      Date.now(),
      undefined,
      { kind: 'call', id: forgedCall, video: false },
    );
    const wire = await f.bob.journal.seal(wireId);
    f.service.store.submit(f.br.key, wire);
    await assert.rejects(
      f.session().resolve({ ...f.input, selector: { ...f.selector, callId: forgedCall } }),
      /CALL_UNAVAILABLE/,
    );
    assert.equal(f.service.store.fetch(f.ar.key).length, 1);
    assert.equal(
      f.a.sql.prepare('SELECT applied FROM signal_inbox WHERE id=?').get(wireId)!.applied,
      0,
    );
    assert.equal(
      f.a.sql.prepare("SELECT count(*) AS count FROM messages WHERE kind='text'").get()!.count,
      0,
    );
    assert.ok(f.actions.length <= 2 && f.actions.every((action) => action === 'delivery-inbox'));
  } finally {
    await f.close();
  }
});

test('cold selection reaches the second bounded page without decrypting unrelated rows; a cached different call cannot override the native selector', async () => {
  const f = await fixture(true);
  try {
    f.service.store.acknowledge(f.ar.key, f.br.key, f.invite.id);
    const ids: string[] = [];
    for (let index = 0; index < 20; index++) {
      const id = randomUUID();
      ids.push(id);
      await f.bob.journal.enqueue(
        f.ar.key,
        id,
        JSON.stringify({
          version: 2,
          phone: f.input.handle,
          name: 'Bob',
          packet: { type: 'ack', id: randomUUID() },
        }),
      );
      f.service.store.submit(f.br.key, await f.bob.journal.seal(id));
    }
    const target = randomUUID(),
      wireId = randomUUID();
    await f.bob.journal.enqueue(
      f.ar.key,
      wireId,
      JSON.stringify({
        version: 2,
        phone: f.input.handle,
        name: 'Bob',
        packet: { type: 'call', action: 'invite', id: target, media: 'voice' },
      }),
      f.invite.createdAt,
      undefined,
      { kind: 'call', id: target, video: false },
    );
    f.service.store.submit(f.br.key, await f.bob.journal.seal(wireId));
    await f.ae.recordCall(f.chat, f.callId, f.br.key, 'voice', 'declined', 'incoming');
    const binding = await f
      .session()
      .resolve({ ...f.input, selector: { ...f.selector, callId: target } });
    assert.equal(binding.callId, target, 'the unrelated declined call is never substituted');
    assert.deepEqual(f.actions, ['delivery-inbox', 'delivery-inbox']);
    assert.equal(f.a.sql.prepare('SELECT count(*) AS count FROM signal_inbox').get()!.count, 1);
    const unrelated = f.service.store.fetch(f.ar.key);
    assert.equal(unrelated.length, 20);
    assert.ok(
      unrelated.every((row) => ids.includes(row.id)),
      'unrelated ciphertext stays on the server',
    );
    await f.app.journal.receive(unrelated[0]!);
    assert.equal(
      f.a.sql.prepare('SELECT count(*) AS count FROM signal_inbox').get()!.count,
      2,
      'skipped ratchet keys remain available for normal app processing',
    );
  } finally {
    await f.close();
  }
});

test('changing account or blocking during the signed challenge prevents the submit and a warm cache cannot authorize a forged selector', async () => {
  const f = await fixture();
  try {
    const session = f.session(),
      binding = await session.resolve(f.input);
    await assert.rejects(
      session.resolve({ ...f.input, selector: { ...f.selector, accountHint: 'a'.repeat(64) } }),
      /CALL_UNAVAILABLE/,
    );
    f.a.sql.prepare('UPDATE identity SET public_key=?').run('a'.repeat(64));
    await assert.rejects(session.send({ ...binding, content: 'No' }), /ACCOUNT_CHANGED/);
    f.a.sql.prepare('UPDATE identity SET public_key=?').run(f.ar.key);
    const paths: string[] = [];
    f.intercept(async (input, init) => {
      paths.push(new URL(String(input)).pathname);
      const response = await fetch(input, init);
      await f.ae.block(f.br.key);
      return response;
    });
    const result = await session.send({
      ...binding,
      content: 'Pending, never uploaded to a blocked peer.',
    });
    assert.equal(result.committed, true);
    assert.equal(result.uploaded, false);
    assert.deepEqual(paths, ['/challenge']);
    assert.equal(f.service.store.fetch(f.br.key).length, 0);
  } finally {
    await f.close();
  }
});
