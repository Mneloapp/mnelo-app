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

test('preparing an outgoing ring cannot allocate media after cancellation', async () => {
  const own = { ...createKeys(randomBytes), name: 'Fixture' };
  const remote = createKeys(randomBytes).key,
    id = randomUUID();
  let resolve!: (v: RTCConfiguration) => void,
    creations = 0;
  let call = { id, peer: remote, status: 'ringing' } as DeviceCall;
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
  const pending = mesh.prepareOutgoingMedia(remote, id, {
    getTracks: () => [],
  } as unknown as MediaStream);
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

test('call SDP updates wait for native negotiation while the inbox remains free and candidates add without renegotiation', async () => {
  const alice = { ...createKeys(randomBytes), name: 'Fixture Alice' };
  const bob = { ...createKeys(randomBytes), name: 'Fixture Bob' };
  const id = randomUUID();
  const relay = 'a=candidate:1 1 udp 100 192.0.2.1 4000 typ relay raddr 0.0.0.0 rport 0';
  const fallback = 'a=candidate:2 1 udp 90 192.0.2.2 4001 typ relay raddr 0.0.0.0 rport 0';
  let allowAnswer!: () => void;
  const answerReady = new Promise<void>((resolve) => {
    allowAnswer = resolve;
  });
  class Peer extends EventTarget {
    iceGatheringState = 'gathering';
    signalingState = 'stable';
    connectionState = 'new';
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    remoteSets = 0;
    added: RTCIceCandidateInit[] = [];
    addTrack() {}
    createDataChannel(label: string) {
      return Object.assign(new EventTarget(), { label, close() {} });
    }
    async createOffer() {
      return { type: 'offer', sdp: this.sdp() };
    }
    async createAnswer() {
      await answerReady;
      return { type: 'answer', sdp: this.sdp() };
    }
    sdp() {
      return [
        'v=0',
        'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=mid:0',
        'a=ice-ufrag:fixture',
        'a=ice-pwd:fixture-secret',
        relay,
        '',
      ].join('\r\n');
    }
    async setLocalDescription(value: RTCSessionDescriptionInit) {
      this.localDescription = value;
      this.signalingState = value.type === 'offer' ? 'have-local-offer' : 'stable';
    }
    async setRemoteDescription(value: RTCSessionDescriptionInit) {
      this.remoteDescription = value;
      this.remoteSets++;
      this.signalingState = value.type === 'offer' ? 'have-remote-offer' : 'stable';
    }
    async addIceCandidate(value: RTCIceCandidateInit) {
      this.added.push(value);
      this.remoteDescription!.sdp += 'a=' + value.candidate + '\r\n';
    }
    fallback() {
      this.localDescription!.sdp += fallback + '\r\n';
      this.dispatchEvent(new Event('icecandidate'));
    }
    close() {
      this.connectionState = 'closed';
      this.dispatchEvent(new Event('connectionstatechange'));
    }
  }
  const ap = new Peer(),
    bp = new Peer();
  const engine = { acceptsPeer: async () => true } as unknown as DeviceMessenger;
  const a = new PeerMesh(
    alice,
    engine,
    'ws://127.0.0.1:8084',
    () => ap as unknown as RTCPeerConnection,
    randomUUID,
    () => {},
    async () => ({ iceServers: [] }),
  );
  const b = new PeerMesh(
    bob,
    engine,
    'ws://127.0.0.1:8084',
    () => bp as unknown as RTCPeerConnection,
    randomUUID,
    () => {},
    async () => ({ iceServers: [] }),
  );
  const stream = { getTracks: () => [] } as unknown as MediaStream;
  const controller = {
    snapshot: () => ({ id, status: 'connecting' }),
    mediaAllowed: () => true,
    allowedOffer: () => stream,
    allowedAnswer: () => true,
    outputStream: () => stream,
    stage: () => {},
    stop: () => {},
    failed: async () => assert.fail('call failed'),
  } as unknown as DeviceCalls;
  let callerStatus = 'ringing';
  a.calls = {
    ...controller,
    snapshot: () => ({ id, peer: bob.key, incoming: false, local: stream, status: callerStatus }),
    mediaAllowed: () => callerStatus === 'connecting',
  } as unknown as DeviceCalls;
  b.calls = controller;
  a.callSignaling = async (_peer, envelope) => b.receiveCallSignal(alice.key, envelope);
  b.callSignaling = async (_peer, envelope) => a.receiveCallSignal(bob.key, envelope);
  try {
    await a.prepareOutgoingMedia(bob.key, id, stream);
    assert.equal(ap.localDescription?.type, 'offer', 'caller gathers while ringing');
    assert.equal(
      Boolean(bp.remoteDescription),
      false,
      'no offer reaches recipient before acceptance',
    );
    assert.equal(Boolean(ap.remoteDescription), false, 'no media connection before acceptance');
    callerStatus = 'connecting';
    await a.startMedia(bob.key, id, stream);
    assert.equal(
      Boolean(ap.remoteDescription),
      false,
      'the inbox returns while TURN gathering is still pending',
    );
    const until = Date.now() + 3000;
    while (!bp.remoteDescription) {
      assert.ok(Date.now() < until, 'offer arrives before the delayed native answer');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    ap.fallback();
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(bp.added.length, 0, 'fallback stays queued behind pending native negotiation');
    allowAnswer();
    while (!ap.remoteDescription) {
      assert.ok(Date.now() < until, 'the asynchronous handshake still completes');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(ap.iceGatheringState, 'gathering');
    assert.equal(bp.iceGatheringState, 'gathering');
    assert.equal(ap.remoteDescription?.type, 'answer');
    assert.equal(bp.remoteDescription?.type, 'offer');
    bp.fallback();
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(ap.iceGatheringState, 'gathering', 'fallback sent before slow TURN timeout');
    assert.equal(bp.iceGatheringState, 'gathering');
    assert.equal(ap.added.length, 1);
    assert.equal(bp.added.length, 1);
    assert.equal(ap.remoteSets, 1);
    assert.equal(bp.remoteSets, 1);
  } finally {
    a.stop();
    b.stop();
  }
});

test('authenticated call SDP does not hold the inbox while TURN is pending; hangup cancels allocation', async () => {
  const { signSignal } = await import('../../src/messenger/signaling');
  const own = { ...createKeys(randomBytes), name: 'Fixture' };
  const remote = createKeys(randomBytes);
  const id = randomUUID();
  let configure!: (value: RTCConfiguration) => void;
  let creations = 0;
  const stream = { getTracks: () => [] } as unknown as MediaStream;
  let call = {
    id,
    peer: remote.key,
    incoming: true,
    status: 'connecting',
    local: stream,
  } as DeviceCall;
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
      new Promise((resolve) => {
        configure = resolve;
      }),
  );
  mesh.calls = {
    snapshot: () => call,
    allowedOffer: () => (call.status === 'connecting' ? stream : null),
    mediaAllowed: () => call.status === 'connecting',
    stage: () => {},
    failed: async () => {},
    stop: () => {},
  } as unknown as DeviceCalls;
  const offer = signSignal(remote.secret, {
    protocol: 'mnelo-dtls-v1',
    from: remote.key,
    to: own.key,
    session: id,
    purpose: 'call',
    expires: Date.now() + 60000,
    type: 'offer',
    sdp: 'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
  });
  try {
    // This promise must complete before configuration is resolved, so the
    // serial caller can deliver a following message or decline immediately.
    await mesh.receiveCallSignal(remote.key, offer);
    assert.equal(typeof configure, 'function');
    call = { ...call, status: 'ended' };
    mesh.endMedia(remote.key, id);
    configure({ iceServers: [] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(creations, 0, 'late credentials do not create cancelled media');
  } finally {
    mesh.stop();
  }
});
