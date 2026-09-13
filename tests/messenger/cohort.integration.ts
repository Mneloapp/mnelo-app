import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { startRelay } from '../../relay/server';
import { createKeys, sign } from '../../src/messenger/crypto';
import { authenticationPayload, readSignal, signSignal } from '../../src/messenger/signaling';

// Synthetic local identities only. Never targets a configured relay, sends SMS or writes state.
test('50 simultaneous local peers authenticate, route signed signals and reconnect cleanly', async () => {
  const relay = startRelay();
  const identities = Array.from({ length: 50 }, () => createKeys(randomBytes));
  const sockets = new Set<WebSocket>();
  const deadline = AbortSignal.timeout(20_000);
  await once(relay.server, 'listening', { signal: deadline });
  const address = relay.server.address();
  assert.ok(address && typeof address === 'object');
  const url = `ws://127.0.0.1:${address.port}`;

  const next = async (socket: WebSocket) => {
    const [bytes] = await once(socket, 'message', { signal: deadline });
    return JSON.parse(bytes.toString());
  };
  const connect = async (identity: (typeof identities)[number]) => {
    const socket = new WebSocket(url);
    sockets.add(socket);
    const challenge = await next(socket);
    assert.equal(challenge.type, 'challenge');
    const ready = next(socket);
    socket.send(
      JSON.stringify({
        type: 'auth',
        key: identity.key,
        signature: sign(identity.secret, authenticationPayload(identity.key, challenge.nonce)),
      }),
    );
    assert.equal((await ready).type, 'ready');
    return socket;
  };
  const disconnect = async (clients: WebSocket[]) => {
    const closed = [...relay.server.clients].map((socket) =>
      once(socket, 'close', { signal: deadline }),
    );
    for (const socket of clients) socket.close();
    await Promise.all(closed);
    assert.equal(relay.liveConnections(), 0);
  };

  try {
    const clients: WebSocket[] = [];
    // Connections remain open together; this does not claim a burst-accept or WebRTC benchmark.
    for (const identity of identities) clients.push(await connect(identity));
    assert.equal(relay.liveConnections(), 50);

    for (let i = 0; i < clients.length; i++) {
      const recipient = identities[(i + 1) % identities.length]!;
      const response = next(clients[i]!);
      clients[i]!.send(JSON.stringify({ type: 'probe', to: recipient.key }));
      assert.deepEqual(await response, { type: 'presence', peer: recipient.key, online: true });
    }

    // Each of the 50 clients sends and receives in a ring, with no message content in the relay.
    for (let i = 0; i < clients.length; i++) {
      const sender = identities[i]!;
      const target = (i + 1) % identities.length;
      const recipient = identities[target]!;
      const envelope = signSignal(sender.secret, {
        protocol: 'mnelo-dtls-v1',
        from: sender.key,
        to: recipient.key,
        session: randomUUID(),
        type: 'offer',
        purpose: 'call',
        sdp: 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'),
        expires: Date.now() + 60_000,
      });
      const delivered = next(clients[target]!);
      clients[i]!.send(JSON.stringify({ type: 'signal', to: recipient.key, envelope }));
      const packet = await delivered;
      assert.equal(packet.type, 'signal');
      assert.deepEqual(packet.envelope, envelope);
      assert.equal(readSignal(packet.envelope, recipient.key)?.from, sender.key);
    }
    await disconnect(clients);

    const reconnected: WebSocket[] = [];
    for (const identity of identities) reconnected.push(await connect(identity));
    assert.equal(relay.liveConnections(), 50);
    for (const [i, socket] of reconnected.entries()) {
      const response = next(socket);
      socket.send(JSON.stringify({ type: 'probe', to: identities[(i + 1) % 50]!.key }));
      // A stale queued signal would arrive instead of this explicit probe response.
      assert.equal((await response).type, 'presence');
    }
    await disconnect(reconnected);
  } finally {
    for (const socket of sockets) socket.terminate();
    await relay.close();
  }
});
