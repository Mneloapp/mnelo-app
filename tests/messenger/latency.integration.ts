import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { fixtureSms } from '../../identity/verification';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { startRelay } from '../../relay/server';
import { DeviceMessenger } from '../../src/messenger/engine';
import { PhoneClient } from '../../src/messenger/phone-client';
import { PhoneRequestQueue } from '../../src/messenger/phone-request-queue';
import { ApplicationDelivery } from '../../src/messenger/delivery/application';
import { sign } from '../../src/messenger/crypto';
import { authenticationPayload, signSignal } from '../../src/messenger/signaling';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 20000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, 'delivery did not finish within 20 seconds');
    await wait(10);
  }
}

test('real Signal, signed HTTP and WebSocket wakes deliver prompt receipts and call negotiation with the production scheduler', async () => {
  const engines = [0, 1].map(
    () => new DeviceMessenger(deliveryDatabase().db, randomBytes, randomUUID),
  );
  const roots: NonNullable<ReturnType<DeviceMessenger['currentIdentity']>>[] = [];
  for (const [i, engine] of engines.entries()) {
    await engine.initialize();
    roots.push(await engine.createIdentity('Synthetic ' + i));
  }
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
  const relay = startRelay();
  service.onAccepted = (sender, recipient) => relay.deliveryAvailable(sender, recipient);
  await Promise.all([once(server, 'listening'), once(relay.server, 'listening')]);
  const address = server.address(),
    relayAddress = relay.server.address();
  assert.ok(
    address && typeof address !== 'string' && relayAddress && typeof relayAddress !== 'string',
  );
  const url = `http://127.0.0.1:${address.port}`;
  const phones = ['+12025550101', '+12025550102'];
  for (const [i, engine] of engines.entries()) {
    registry.bind(registry.index(phones[i]!), roots[i]!.key, true, Date.now());
    await engine.completePhoneEnrollment(
      { phone: phones[i]!, service: url, testOnly: true, verifiedAt: Date.now() },
      roots[i]!.key,
    );
    await engine.trustPhoneContact({
      key: roots[1 - i]!.key,
      phone: phones[1 - i]!,
      name: 'Synthetic contact',
    });
  }
  // 80 ms per HTTP round trip. Every command still performs the real nonce,
  // proof, schema validation, server operation and Signal journal transaction.
  const commands: Record<string, number> = {};
  const request: typeof fetch = async (...args) => {
    const body = JSON.parse(String(args[1]?.body ?? '{}'));
    if (body.command) {
      const type = body.command.action + (body.command.envelope ? ':submit' : ':poll');
      commands[type] = (commands[type] ?? 0) + 1;
    }
    await wait(80);
    return fetch(...args);
  };
  const apps = engines.map(
    (engine, i) =>
      new ApplicationDelivery(
        engine,
        new PhoneClient(url, roots[i]!, request, new PhoneRequestQueue().run),
        new NodeSignal(),
        randomBytes,
        randomUUID,
        () => {},
        async () => null,
      ),
  );
  const sockets: WebSocket[] = [];
  for (const [i, engine] of engines.entries())
    engine.attachTransport({
      send: () => false,
      sendDurable: (...args) => apps[i]!.sendDurable(...args),
      stop: () => apps[i]!.stop(),
    });
  try {
    // These are already enrolled, mutually ready contacts, as on the two phones.
    // Publish both before starting either profile outbox; first-contact key
    // readiness/backoff has separate integration coverage.
    for (const [i, app] of apps.entries()) {
      await app.initialize();
      const keys = await app.journal.initialize();
      service.execute(roots[i]!.key, {
        action: 'delivery-publish',
        keys,
        signature: app.journal.binding(keys),
      });
    }
    for (const app of apps) {
      await app.start();
      await app.pump.tick();
    }
    await Promise.all(
      apps.map(
        (app, i) =>
          new Promise<void>((resolve) => {
            const socket = new WebSocket(`ws://127.0.0.1:${relayAddress.port}`);
            sockets.push(socket);
            socket.on('message', (bytes) => {
              const value = JSON.parse(bytes.toString());
              if (value.type === 'challenge')
                socket.send(
                  JSON.stringify({
                    type: 'auth',
                    key: roots[i]!.key,
                    signature: sign(
                      roots[i]!.secret,
                      authenticationPayload(roots[i]!.key, value.nonce),
                    ),
                  }),
                );
              if (value.type === 'ready') {
                app.pump.receiveWake();
                resolve();
              }
              if (value.type === 'delivery') app.pump.receiveWake();
            });
          }),
      ),
    );
    const chat = (await engines[0]!.chats())[0]!.id;
    const warm = await engines[0]!.send(chat, 'Synthetic warm-up');
    await until(
      async () =>
        (await engines[0]!.messages(chat)).find((m) => m.id === warm)?.status === 'delivered',
    );
    // Let initialization/profile synchronization finish and the short burst
    // budget refill. This is not a substitute for backlog/preemption tests.
    await wait(9000);
    const started = Date.now();
    const id = await engines[0]!.send(chat, 'Synthetic latency measurement');
    await until(async () => (await engines[1]!.messages(chat)).some((m) => m.id === id));
    const visible = Date.now();
    await until(
      async () =>
        (await engines[0]!.messages(chat)).find((m) => m.id === id)?.status === 'delivered',
    );
    const delivered = Date.now();
    await engines[1]!.markRead(chat);
    await until(
      async () => (await engines[0]!.messages(chat)).find((m) => m.id === id)?.status === 'read',
    );
    const read = Date.now();
    const result: Record<string, number> = {
      sendToVisible: visible - started,
      visibleToDelivered: delivered - visible,
      markReadToRead: read - delivered,
    };
    // The call test measures the real encrypted accept -> signed offer -> signed
    // answer path. ICE/media is tested separately; no RTP claim is made here.
    for (const media of ['voice', 'video'] as const) {
      const call = randomUUID();
      let answered = false;
      const sdp = [
        'v=0',
        'o=- 1 1 IN IP4 0.0.0.0',
        's=-',
        't=0 0',
        'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=mid:0',
        'a=ice-ufrag:fixture',
        'a=ice-pwd:fixture-password',
        '',
      ].join('\r\n');
      const description = (i: number, type: 'offer' | 'answer') =>
        signSignal(roots[i]!.secret, {
          protocol: 'mnelo-dtls-v1',
          from: roots[i]!.key,
          to: roots[1 - i]!.key,
          session: call,
          purpose: 'call',
          expires: Date.now() + 120000,
          type,
          sdp,
        });
      apps[0]!.calls = {
        control: async () => {
          await apps[0]!.sendSignal(roots[1]!.key, description(0, 'offer'));
        },
        signal: async () => {
          answered = true;
        },
      };
      apps[1]!.calls = {
        control: async () => {},
        signal: async () => {
          await apps[1]!.sendSignal(roots[0]!.key, description(1, 'answer'));
        },
      };
      const accept = Date.now();
      await apps[1]!.sendDurable(roots[0]!.key, {
        type: 'call',
        id: call,
        action: 'accept',
        media,
      });
      await until(() => answered);
      result[media + 'AcceptOfferAnswer'] = Date.now() - accept;
    }
    const burst: { id: string; sent: number }[] = [];
    const receivedAt = new Map<string, number>();
    const readAt = new Map<string, number>();
    let reading = Promise.resolve();
    const stopRead = engines[0]!.subscribe(() => {
      reading = reading.then(async () => {
        for (const message of await engines[0]!.messages(chat))
          if (message.status === 'read' && !readAt.has(message.id))
            readAt.set(message.id, Date.now());
      });
    });
    const stopIncoming = engines[1]!.subscribeIncoming((message) => {
      if (message.type !== 'message') return;
      receivedAt.set(message.id, Date.now());
      void engines[1]!.markRead(chat);
    });
    try {
      for (let index = 0; index < 60; index++) {
        const sent = Date.now();
        burst.push({ id: await engines[0]!.send(chat, 'Synthetic burst ' + index), sent });
        await wait(1000);
      }
      await until(async () => {
        const messages = await engines[0]!.messages(chat);
        if (messages.length === 40)
          messages.push(...(await engines[0]!.messages(chat, messages.at(-1)!.sequence)));
        return burst.every((row) => messages.some((m) => m.id === row.id && m.status === 'read'));
      });
      await reading;
      assert.deepEqual(
        [...receivedAt.keys()],
        burst.map((row) => row.id),
        'consecutive messages remain in sending order',
      );
      result.burstMaximumRead = Math.max(...burst.map((row) => readAt.get(row.id)! - row.sent));
      result.burstMaximumVisible = Math.max(
        ...burst.map((row) => receivedAt.get(row.id)! - row.sent),
      );
    } finally {
      stopIncoming();
      stopRead();
      await reading;
    }
    process.stdout.write('COMMAND_COUNTS ' + JSON.stringify(commands) + '\n');
    process.stdout.write('LATENCY_MS ' + JSON.stringify(result) + '\n');
    if (!process.env.MNELO_LATENCY_BASELINE) {
      assert.ok(
        result.burstMaximumRead! < 2500,
        'read receipts must keep up throughout the full burst',
      );
      assert.ok(
        result.burstMaximumVisible! < 2500,
        'one-second message bursts must not exhaust the interactive queue',
      );
      assert.ok(result.visibleToDelivered! < 1800, 'delivery receipt must precede housekeeping');
      assert.ok(
        result.markReadToRead! < 1800,
        'read receipt must use the interactive request budget',
      );
      assert.ok(
        result.voiceAcceptOfferAnswer! < 3000 && result.videoAcceptOfferAnswer! < 3000,
        'call signaling must not add seconds of fixed pacing',
      );
    }
  } finally {
    sockets.forEach((socket) => socket.close());
    for (const app of apps) app.stop();
    await Promise.all(apps.map((app) => app.pump.tick()));
    await Promise.all(engines.map((engine) => engine.close()));
    await relay.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.store.close();
    service.directory.close();
    registry.close();
  }
});
