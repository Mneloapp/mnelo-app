import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createKeys } from '../../src/messenger/crypto';
import { PeerMesh } from '../../src/messenger/peer-mesh';
import type { DeviceMessenger } from '../../src/messenger/engine';
import type { DeviceCalls, DeviceCall } from '../../src/messenger/calls';

test('pending ICE cannot create a peer after stop or block and concurrent probes coalesce', async () => {
  const original = globalThis.WebSocket;
  let socket!: Socket;
  class Socket {
    static OPEN = 1;
    readyState = 1;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      socket = this;
    }
    send() {}
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  const own = { ...createKeys(randomBytes), name: 'Fixture' };
  const remote = createKeys(randomBytes).key;
  let allowed = true,
    creations = 0,
    fetches = 0;
  let resolve!: (v: RTCConfiguration) => void;
  const engine = { acceptsPeer: async () => allowed } as unknown as DeviceMessenger;
  const mesh = new PeerMesh(
    own,
    engine,
    'ws://127.0.0.1:8084',
    () => {
      creations++;
      throw new Error('Unexpected peer');
    },
    randomUUID,
    () => {},
    () => {
      fetches++;
      return new Promise((r) => {
        resolve = r;
      });
    },
  );
  const tick = () => new Promise((r) => setImmediate(r));
  try {
    mesh.start();
    const presence = () =>
      socket.onmessage?.({
        data: JSON.stringify({ type: 'presence', peer: remote, online: true }),
      });
    presence();
    presence();
    await tick();
    assert.equal(fetches, 1);
    mesh.stop();
    resolve({ iceServers: [] });
    await tick();
    assert.equal(creations, 0);
    mesh.start();
    presence();
    await tick();
    allowed = false;
    await mesh.enforceContacts();
    resolve({ iceServers: [] });
    await tick();
    assert.equal(creations, 0);
  } finally {
    mesh.stop();
    globalThis.WebSocket = original;
  }
});

test('a cancelled call cannot allocate media after delayed TURN credentials arrive', async () => {
  const own = { ...createKeys(randomBytes), name: 'Fixture' };
  const remote = createKeys(randomBytes).key,
    id = randomUUID();
  let resolve!: (v: RTCConfiguration) => void,
    creations = 0;
  let call = { id, peer: remote, status: 'connecting' } as DeviceCall;
  const mesh = new PeerMesh(
    own,
    { acceptsPeer: async () => true } as unknown as DeviceMessenger,
    'ws://127.0.0.1:8084',
    () => {
      creations++;
      throw new Error('Unexpected peer');
    },
    randomUUID,
    () => {},
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  mesh.calls = { snapshot: () => call, stop: () => {}, stage: () => {} } as unknown as DeviceCalls;
  const pending = mesh.startMedia(remote, id, { getTracks: () => [] } as unknown as MediaStream);
  call = { ...call, status: 'ended' };
  mesh.endMedia(remote, id);
  resolve({ iceServers: [] });
  await assert.rejects(pending, /CALL_CANCELLED/);
  assert.equal(creations, 0);
  mesh.stop();
});

test('unknown offers require a verified directory match; blocked/spoofed introductions never become peers', async () => {
  const { signSignal } = await import('../../src/messenger/signaling');
  const original = globalThis.WebSocket;
  let socket!: { onmessage: ((event: { data: string }) => void) | null };
  class Socket {
    static OPEN = 1;
    readyState = 1;
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor() {
      socket = this;
    }
    send() {}
    close() {
      this.readyState = 3;
    }
  }
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  const own = { ...createKeys(randomBytes), name: 'Fixture' };
  const sender = createKeys(randomBytes),
    blocked = createKeys(randomBytes),
    spoof = createKeys(randomBytes);
  const requests: string[] = [],
    lookups: string[] = [];
  const engine = {
    acceptsPeer: async () => false,
    contacts: async () => [{ key: blocked.key, blocked: 1 }],
    contactRequests: async () => requests.map((public_key) => ({ public_key })),
    receiveContactRequest: async (peer: string) => {
      requests.push(peer);
      return true;
    },
  } as unknown as DeviceMessenger;
  const mesh = new PeerMesh(
    own,
    engine,
    'ws://127.0.0.1:8084',
    () => {
      throw new Error('UNKNOWN_PEER_CREATED');
    },
    randomUUID,
    () => {},
    undefined,
    async (phone, peer) => {
      lookups.push(peer);
      return phone === '+12025550101' && peer === sender.key;
    },
  );
  function offer(key: ReturnType<typeof createKeys>, purpose: 'message' | 'call' = 'message') {
    return signSignal(key.secret, {
      protocol: 'mnelo-dtls-v1',
      from: key.key,
      to: own.key,
      session: randomUUID(),
      expires: Date.now() + 60000,
      type: 'offer',
      purpose,
      introduction: '+12025550101',
      sdp: 'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
    });
  }
  const tick = () => new Promise((r) => setImmediate(r));
  const send = (envelope: unknown) =>
    socket.onmessage?.({ data: JSON.stringify({ type: 'signal', envelope }) });
  try {
    mesh.start();
    send(offer(blocked));
    send(offer(spoof));
    await tick();
    assert.equal(lookups.includes(blocked.key), false);
    assert.deepEqual(requests, []);
    send(offer(sender, 'call'));
    await tick();
    assert.deepEqual(requests, []);
    const signed = offer(sender);
    send({ ...signed, signature: '0'.repeat(128) });
    await tick();
    assert.deepEqual(requests, []);
    send(signed);
    await tick();
    assert.deepEqual(requests, [sender.key]);
    send(signed);
    await tick();
    assert.deepEqual(requests, [sender.key]);
    assert.equal(lookups.filter((key) => key === sender.key).length, 1);
  } finally {
    mesh.stop();
    globalThis.WebSocket = original;
  }
});
