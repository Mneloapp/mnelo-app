import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startRelay } from '../../relay/server';
import { createKeys, sign } from '../../src/messenger/crypto';
import {
  authenticationPayload,
  readSignal,
  signSignal,
  relayAddress,
} from '../../src/messenger/signaling';

const fingerprint = 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':');
async function client(url: string, identity: ReturnType<typeof createKeys>) {
  const socket = new WebSocket(url);
  const [challenge] = await once(socket, 'message');
  const nonce = JSON.parse(challenge.toString()).nonce as string;
  socket.send(
    JSON.stringify({
      type: 'auth',
      key: identity.key,
      signature: sign(identity.secret, authenticationPayload(identity.key, nonce)),
    }),
  );
  const [ready] = await once(socket, 'message');
  assert.equal(JSON.parse(ready.toString()).type, 'ready');
  return socket;
}
test('durable delivery hints contain no sender/content and obey live enrollment/block policy', async () => {
  const a = createKeys(randomBytes),
    b = createKeys(randomBytes);
  let blocked = false;
  const allowed = new Set([a.key, b.key]);
  const relay = startRelay(0, {
    scope: (key) => (allowed.has(key) ? 'fixture' : null),
    canContact: () => !blocked,
  });
  await once(relay.server, 'listening');
  try {
    const address = relay.server.address();
    assert.ok(address && typeof address === 'object');
    const receiver = await client(`ws://127.0.0.1:${address.port}`, b);
    const arrived = once(receiver, 'message');
    relay.deliveryAvailable(a.key, b.key);
    assert.deepEqual(JSON.parse((await arrived)[0].toString()), { type: 'delivery' });
    const seen: unknown[] = [];
    receiver.on('message', (bytes) => seen.push(JSON.parse(bytes.toString())));
    blocked = true;
    relay.deliveryAvailable(a.key, b.key);
    blocked = false;
    allowed.delete(a.key);
    relay.deliveryAvailable(a.key, b.key);
    const barrier = once(receiver, 'message');
    receiver.send(JSON.stringify({ type: 'probe', to: a.key }));
    await barrier;
    assert.equal(seen.length, 1);
    assert.equal((seen[0] as { type: string }).type, 'presence');
    const closed = once(receiver, 'close');
    receiver.send(JSON.stringify({ type: 'delivery', to: a.key }));
    assert.equal((await closed)[0], 1008, 'clients cannot impersonate a server delivery hint');
  } finally {
    await relay.close();
  }
});
test('relay has no offline delivery; reconnection does not replay previous signals', async () => {
  const relay = startRelay();
  await once(relay.server, 'listening');
  try {
    const address = relay.server.address();
    assert.ok(address && typeof address === 'object');
    const url = `ws://127.0.0.1:${address.port}`;
    const a = createKeys(randomBytes),
      b = createKeys(randomBytes);
    const socket = await client(url, a);
    const envelope = signSignal(a.secret, {
      protocol: 'mnelo-dtls-v1',
      from: a.key,
      to: b.key,
      session: randomUUID(),
      type: 'offer',
      sdp: fingerprint,
      expires: Date.now() + 60_000,
    });
    socket.send(JSON.stringify({ type: 'signal', to: b.key, envelope }));
    const [unavailable] = await once(socket, 'message');
    assert.equal(JSON.parse(unavailable.toString()).type, 'unavailable');
    const receiver = await client(url, b);
    let unexpected = 0;
    receiver.on('message', () => {
      unexpected++;
    });
    receiver.send(JSON.stringify({ type: 'probe', to: a.key }));
    const [presence] = await once(receiver, 'message');
    assert.equal(JSON.parse(presence.toString()).type, 'presence');
    assert.equal(unexpected, 1, 'only the explicit probe response, no stored signal');
    const delivery = once(receiver, 'message');
    socket.send(JSON.stringify({ type: 'signal', to: b.key, envelope }));
    assert.equal(JSON.parse((await delivery)[0].toString()).type, 'signal');
    const serverClosed = once([...relay.server.clients][0]!, 'close');
    socket.close();
    await once(socket, 'close');
    await serverClosed;
    assert.equal(relay.liveConnections(), 1);
  } finally {
    await relay.close();
  }
});
test('relay rejects plaintext message APIs and unauthenticated route impersonation', async () => {
  const relay = startRelay();
  await once(relay.server, 'listening');
  try {
    const address = relay.server.address();
    assert.ok(address && typeof address === 'object');
    const url = `ws://127.0.0.1:${address.port}`;
    const a = createKeys(randomBytes);
    const socket = await client(url, a);
    const close = once(socket, 'close');
    socket.send(JSON.stringify({ type: 'message', body: 'must never be stored' }));
    assert.equal((await close)[0], 1008);
    const impostor = new WebSocket(url);
    await once(impostor, 'message');
    const denied = once(impostor, 'close');
    impostor.send(JSON.stringify({ type: 'auth', key: a.key, signature: '00'.repeat(64) }));
    assert.equal((await denied)[0], 1008);
  } finally {
    await relay.close();
  }
});
test('signed SDP binds identity, receiver, lifetime and every fingerprint', () => {
  const a = createKeys(randomBytes),
    b = createKeys(randomBytes);
  const now = Date.now();
  const signal = {
    protocol: 'mnelo-dtls-v1' as const,
    from: a.key,
    to: b.key,
    session: randomUUID(),
    type: 'offer' as const,
    sdp: fingerprint,
    expires: now + 60_000,
  };
  const envelope = signSignal(a.secret, signal);
  assert.ok(readSignal(envelope, b.key, now));
  assert.equal(readSignal(envelope, a.key, now), null);
  assert.equal(readSignal(envelope, b.key, now + 60_001), null);
  assert.equal(
    readSignal(
      { ...envelope, payload: JSON.stringify({ ...signal, sdp: fingerprint.replace('AB', 'CD') }) },
      b.key,
      now,
    ),
    null,
  );
  assert.equal(
    readSignal(
      signSignal(a.secret, { ...signal, sdp: fingerprint + '\na=fingerprint:sha-1 AB:CD' }),
      b.key,
      now,
    ),
    null,
  );
  assert.equal(relayAddress(undefined, true), null);
  assert.throws(() => relayAddress('ws://example.com', false));
});
