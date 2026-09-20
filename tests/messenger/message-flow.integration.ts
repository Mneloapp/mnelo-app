import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { PhoneRegistry } from '../../identity/registry';
import { PhoneService } from '../../identity/service';
import { startPhoneHttp } from '../../identity/http';
import { fixtureSms } from '../../identity/verification';
import { DeliveryService } from '../../identity/delivery-service';
import { DeliveryStore } from '../../identity/delivery-store';
import { MediaStore } from '../../identity/media-store';
import { SignalDirectory } from '../../identity/signal-directory';
import { DeviceMessenger } from '../../src/messenger/engine';
import { PhoneClient } from '../../src/messenger/phone-client';
import { PhoneRequestQueue } from '../../src/messenger/phone-request-queue';
import { ApplicationDelivery } from '../../src/messenger/delivery/application';
import { MEDIA_CHUNK_BYTES } from '../../src/messenger/delivery/media-schema';
import { deliveryDatabase } from './delivery-fixture';
import { NodeSignal } from './node-signal';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean> | boolean) {
  const deadline = Date.now() + 40000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, 'message flow exceeded 40 seconds');
    await wait(10);
  }
}

test('autonomous media progress, text receipts and reconnect use real Signal/HTTP without manual polling or duplicate projection', async () => {
  const engines = [0, 1].map(
    () => new DeviceMessenger(deliveryDatabase().db, randomBytes, randomUUID),
  );
  const roots: NonNullable<ReturnType<DeviceMessenger['currentIdentity']>>[] = [];
  for (const [index, engine] of engines.entries()) {
    await engine.initialize();
    roots.push(await engine.createIdentity('Synthetic ' + index));
  }
  const registry = new PhoneRegistry(new DatabaseSync(':memory:'), randomBytes(32));
  const access = {
    registered: (key: string) => Boolean(registry.status(key)),
    canContact: () => true,
  };
  const service = new DeliveryService(
    new DeliveryStore(new DatabaseSync(':memory:'), access),
    new SignalDirectory(new DatabaseSync(':memory:')),
    new MediaStore(new DatabaseSync(':memory:'), access),
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
  const phones = ['+12025550101', '+12025550102'];
  for (const [index, engine] of engines.entries()) {
    const root = roots[index]!;
    registry.bind(registry.index(phones[index]!), root.key, true, Date.now());
    await engine.completePhoneEnrollment(
      { phone: phones[index]!, service: url, testOnly: true, verifiedAt: Date.now() },
      root.key,
    );
    await engine.trustPhoneContact({
      key: roots[1 - index]!.key,
      phone: phones[1 - index]!,
      name: 'Saved contact',
    });
  }
  let measure = false;
  const commands: { action: string; at: number; device: number }[] = [];
  const apps = engines.map(
    (engine, index) =>
      new ApplicationDelivery(
        engine,
        new PhoneClient(
          url,
          roots[index]!,
          async (...args) => {
            const body = JSON.parse(String(args[1]?.body ?? '{}'));
            // 40 ms per request, 80 ms per nonce + signed command exchange.
            await wait(40);
            const response = await fetch(...args);
            if (measure && body.command)
              commands.push({ action: body.command.action, at: Date.now(), device: index });
            return response;
          },
          new PhoneRequestQueue().run,
        ),
        new NodeSignal(),
        randomBytes,
        randomUUID,
        () => {},
        async () => null,
      ),
  );
  // Same hint emitted by the authenticated relay; it carries no message body.
  service.onAccepted = (_sender, recipient) =>
    apps[roots.findIndex((root) => root.key === recipient)]!.pump.receiveWake();
  for (const [index, engine] of engines.entries())
    engine.attachTransport({
      send: () => false,
      sendDurable: (...args) => apps[index]!.sendDurable(...args),
      stop: () => apps[index]!.stop(),
    });
  const counts = new Map<string, number>();
  const incomingTimes = new Map<string, number>();
  const unsubscribe = engines[1]!.subscribeIncoming((event) => {
    if (event.type === 'message') {
      counts.set(event.id, (counts.get(event.id) ?? 0) + 1);
      incomingTimes.set(event.id, Date.now());
    }
  });
  try {
    for (const [index, app] of apps.entries()) {
      await app.initialize();
      const keys = await app.journal.initialize();
      service.execute(roots[index]!.key, {
        action: 'delivery-publish',
        keys,
        signature: app.journal.binding(keys),
      });
    }
    for (const app of apps) {
      await app.start();
      await app.pump.tick();
    }
    const chat = (await engines[0]!.chats())[0]!.id;
    const warm = await engines[0]!.send(chat, 'Warm-up');
    await until(async () =>
      (await engines[0]!.messages(chat)).some((m) => m.id === warm && m.status === 'delivered'),
    );
    await wait(3000);
    measure = true;
    const bytes = randomBytes(MEDIA_CHUNK_BYTES * 12 + 1);
    const started = Date.now();
    const file = await engines[0]!.send(chat, '', {
      kind: 'file',
      media: {
        name: 'synthetic.bin',
        mime: 'application/octet-stream',
        bytes: bytes.toString('base64'),
        duration: null,
      },
    });
    const textStarted = Date.now();
    const text = await engines[0]!.send(chat, 'Text while the file transfers');
    await until(async () =>
      (await engines[0]!.messages(chat)).some((m) => m.id === text && m.status === 'delivered'),
    );
    const textDelivered = Date.now() - textStarted;
    await engines[1]!.markRead(chat);
    await until(async () =>
      (await engines[0]!.messages(chat)).some((m) => m.id === text && m.status === 'read'),
    );
    await until(() => counts.has(file));
    const mediaVisible = incomingTimes.get(file)! - started;
    assert.equal((await engines[1]!.media(file))?.bytes, bytes.toString('base64'));
    const getTimes = commands
      .filter((row) => row.device === 1 && row.action === 'delivery-blob-get')
      .map((row) => row.at);
    const maximumDownloadGap = Math.max(
      ...getTimes.slice(1).map((at, index) => at - getTimes[index]!),
    );
    const measurements = {
      requestDelayMs: 40,
      mediaParts: 13,
      mediaVisible,
      textVisible: incomingTimes.get(text)! - textStarted,
      textDelivered,
      maximumDownloadGap,
    };
    console.log('MESSAGE_FLOW_MS', JSON.stringify(measurements));
    if (!process.env.MNELO_MESSAGE_BASELINE) {
      assert.ok(
        maximumDownloadGap < 2000,
        'healthy partial downloads must not wait for the idle poll',
      );
      assert.ok(
        mediaVisible < 10000,
        'a 13-part transfer must progress without multi-second idle pauses',
      );
      assert.ok(
        textDelivered < 2200,
        'small messages and their receipts must pass an unfinished attachment',
      );
    }
    apps[1]!.pump.stop();
    const offline = await engines[0]!.send(chat, 'Receiver is offline');
    await until(() => service.store.fetch(roots[1]!.key).length > 0);
    assert.equal(counts.has(offline), false);
    apps[1]!.pump.start();
    apps[1]!.pump.receiveWake();
    await until(() => counts.has(offline));
    await engines[0]!.flush();
    apps.forEach((app) => app.pump.receiveWake());
    await until(async () =>
      (await engines[0]!.messages(chat)).some((m) => m.id === offline && m.status === 'delivered'),
    );
    assert.equal(counts.get(file), 1);
    assert.equal(counts.get(text), 1);
    assert.equal(counts.get(offline), 1);
  } finally {
    unsubscribe();
    apps.forEach((app) => app.stop());
    await Promise.all(apps.map((app) => app.pump.tick()));
    await Promise.all(engines.map((engine) => engine.close()));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.close();
    registry.close();
  }
});
