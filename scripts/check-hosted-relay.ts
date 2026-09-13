import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createKeys, sign } from '../src/messenger/crypto';
import { authenticationPayload, readSignal, signSignal } from '../src/messenger/signaling';

// Deliberate, synthetic deployment test. No dotenv, SMS, device keys, history or media.
async function main() {
  const [flag, value] = process.argv.slice(2);
  if (flag !== '--url' || !value || process.argv.length !== 4)
    throw new Error('EXPLICIT_RELAY_URL_REQUIRED');
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      (url.protocol === 'ws:' && url.hostname === '127.0.0.1' && Boolean(url.port)) ||
      (url.protocol === 'wss:' && url.hostname === 'relay-dev.mnelo.com' && !url.port)
    )
  )
    throw new Error('DEVELOPMENT_RELAY_URL_REQUIRED');
  const identities = Array.from({ length: 50 }, () => createKeys(randomBytes));
  const sockets = new Set<WebSocket>();
  const deadline = AbortSignal.timeout(60_000);
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
    const closed = clients.map((socket) => once(socket, 'close', { signal: deadline }));
    for (const socket of clients) socket.close();
    await Promise.all(closed);
  };
  try {
    const rejected = new WebSocket(url);
    sockets.add(rejected);
    await next(rejected);
    const rejection = once(rejected, 'close', { signal: deadline });
    rejected.send(
      JSON.stringify({ type: 'auth', key: identities[0]!.key, signature: '00'.repeat(64) }),
    );
    assert.equal((await rejection)[0], 1008);

    if (url.protocol === 'wss:') {
      // The hosted relay now requires registered, admitted identities. Keep the
      // 50-peer capacity exercise local; never create accounts just for a probe.
      const unknown = new WebSocket(url);
      sockets.add(unknown);
      const challenge = await next(unknown);
      const denied = once(unknown, 'close', { signal: deadline });
      const key = identities[0]!;
      unknown.send(
        JSON.stringify({
          type: 'auth',
          key: key.key,
          signature: sign(key.secret, authenticationPayload(key.key, challenge.nonce)),
        }),
      );
      assert.equal((await denied)[0], 1008);
      process.stdout.write(
        'PASS: hosted WSS rejects forged signatures and valid but unregistered identities. No SMS, registration, push or media.\n',
      );
      return;
    }

    const clients: WebSocket[] = [];
    for (const identity of identities) clients.push(await connect(identity));
    for (let i = 0; i < clients.length; i++) {
      const target = (i + 1) % clients.length;
      const sender = identities[i]!,
        recipient = identities[target]!;
      const presence = next(clients[i]!);
      clients[i]!.send(JSON.stringify({ type: 'probe', to: recipient.key }));
      assert.deepEqual(await presence, { type: 'presence', peer: recipient.key, online: true });
      const envelope = signSignal(sender.secret, {
        protocol: 'mnelo-dtls-v1',
        from: sender.key,
        to: recipient.key,
        session: randomUUID(),
        type: 'offer',
        purpose: 'call',
        sdp: 'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'),
        expires: Date.now() + 60000,
      });
      const received = next(clients[target]!);
      clients[i]!.send(JSON.stringify({ type: 'signal', to: recipient.key, envelope }));
      const packet = await received;
      assert.equal(packet.type, 'signal');
      assert.deepEqual(packet.envelope, envelope);
      assert.equal(readSignal(packet.envelope, recipient.key)?.from, sender.key);
    }
    await disconnect(clients);
    const reconnected: WebSocket[] = [];
    for (const identity of identities) reconnected.push(await connect(identity));
    for (const [i, socket] of reconnected.entries()) {
      const presence = next(socket);
      socket.send(JSON.stringify({ type: 'probe', to: identities[(i + 1) % 50]!.key }));
      assert.deepEqual(await presence, {
        type: 'presence',
        peer: identities[(i + 1) % 50]!.key,
        online: true,
      });
    }
    await disconnect(reconnected);
    const observer = await connect(createKeys(randomBytes));
    for (const identity of identities) {
      const presence = next(observer);
      observer.send(JSON.stringify({ type: 'probe', to: identity.key }));
      assert.deepEqual(await presence, { type: 'presence', peer: identity.key, online: false });
    }
    await disconnect([observer]);
    process.stdout.write(
      'PASS: rejected invalid signature; 50 simultaneous synthetic peers; 50 signed offers; reconnect; all routes offline after disconnect. No SMS or WebRTC media.\n',
    );
  } finally {
    for (const socket of sockets) socket.terminate();
  }
}
void main().catch(() => {
  process.stderr.write('HOSTED_RELAY_CHECK_FAILED\n');
  process.exitCode = 1;
});
