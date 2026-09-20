import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createKeys } from '../../src/messenger/crypto';
import { signSignal } from '../../src/messenger/signaling';
import { PeerMesh } from '../../src/messenger/peer-mesh';
import type { DeviceMessenger } from '../../src/messenger/engine';
import type { DeviceCall, DeviceCalls } from '../../src/messenger/calls';

const pause = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'asynchronous call setup did not finish');
    await pause(5);
  }
}
const relay = 'a=candidate:1 1 udp 100 192.0.2.1 4000 typ relay raddr 0.0.0.0 rport 0';
const fallback = 'a=candidate:2 1 udp 90 192.0.2.2 4001 typ relay raddr 0.0.0.0 rport 0';
function sdp(extra = '') {
  return [
    'v=0',
    'a=fingerprint:sha-256 ' + Array(32).fill('AA').join(':'),
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=mid:0',
    'a=ice-ufrag:fixture',
    'a=ice-pwd:fixture-secret',
    relay,
    extra,
    '',
  ].join('\r\n');
}
class Peer extends EventTarget {
  iceGatheringState = 'complete';
  signalingState = 'stable';
  connectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  offers = 0;
  remoteSets = 0;
  tracks = 0;
  gatheringListeners = new Set<EventListenerOrEventListenerObject>();
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (type === 'icecandidate' && listener) this.gatheringListeners.add(listener);
    super.addEventListener(type, listener);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (type === 'icecandidate' && listener) this.gatheringListeners.delete(listener);
    super.removeEventListener(type, listener);
  }
  addTrack() {
    this.tracks++;
  }
  createDataChannel(label: string) {
    return Object.assign(new EventTarget(), { label, close() {} });
  }
  async createOffer() {
    this.offers++;
    return { type: 'offer', sdp: sdp() };
  }
  async createAnswer() {
    return { type: 'answer', sdp: sdp() };
  }
  async setLocalDescription(value: RTCSessionDescriptionInit) {
    this.localDescription = value;
    this.signalingState = value.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(value: RTCSessionDescriptionInit) {
    this.remoteSets++;
    this.remoteDescription = value;
    this.signalingState = value.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate(value: RTCIceCandidateInit) {
    this.remoteDescription!.sdp += 'a=' + value.candidate + '\r\n';
  }
  close() {
    this.connectionState = 'closed';
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}
function pair(
  configuration: () => Promise<RTCConfiguration> = async () => ({
    iceServers: [],
    iceTransportPolicy: 'relay',
  }),
) {
  const alice = { ...createKeys(randomBytes), name: 'Synthetic caller' };
  const bob = { ...createKeys(randomBytes), name: 'Synthetic recipient' };
  const id = randomUUID();
  const stream = { getTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;
  function side(own: typeof alice, remote: typeof alice, incoming: boolean) {
    const state = {
      call: {
        id,
        peer: remote.key,
        incoming,
        status: incoming ? 'incoming' : 'ringing',
        local: incoming ? null : stream,
      } as DeviceCall,
      allowed: true,
      peers: [] as Peer[],
      configurations: [] as RTCConfiguration[],
      failures: [] as string[],
    };
    const mesh = new PeerMesh(
      own,
      { acceptsPeer: async () => state.allowed } as unknown as DeviceMessenger,
      'ws://127.0.0.1:8084',
      (configuration) => {
        state.configurations.push(configuration);
        const peer = new Peer();
        state.peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      randomUUID,
      () => {},
      configuration,
    );
    mesh.calls = {
      snapshot: () => state.call,
      mediaAllowed: (peer: string, call: string) =>
        state.call.peer === peer && state.call.id === call && state.call.status === 'connecting',
      allowedOffer: (peer: string, call: string) =>
        state.call.peer === peer &&
        state.call.id === call &&
        state.call.incoming &&
        state.call.status === 'connecting'
          ? state.call.local
          : null,
      allowedAnswer: (peer: string, call: string) =>
        state.call.peer === peer &&
        state.call.id === call &&
        !state.call.incoming &&
        state.call.status === 'connecting',
      outputStream: () => state.call.local,
      stage: () => {},
      stop: () => {},
      failed: async (_peer: string, call: string) => {
        state.failures.push(call);
      },
    } as unknown as DeviceCalls;
    return { state, mesh, own, remote };
  }
  const a = side(alice, bob, false),
    b = side(bob, alice, true);
  a.mesh.callSignaling = async (_peer, envelope) => b.mesh.receiveCallSignal(alice.key, envelope);
  b.mesh.callSignaling = async (_peer, envelope) => a.mesh.receiveCallSignal(bob.key, envelope);
  const offer = (extra = '', expires = Date.now() + 60000, from = alice, session = id) =>
    signSignal(from.secret, {
      protocol: 'mnelo-dtls-v1',
      from: from.key,
      to: bob.key,
      session,
      purpose: 'call',
      expires,
      type: 'offer',
      sdp: sdp(extra),
    });
  return {
    a,
    b,
    id,
    stream,
    offer,
    stop: () => {
      a.mesh.stop();
      b.mesh.stop();
    },
  };
}

test('early SDP is cached with no recipient media, then latest offer and reordered answer resume only after consent', async () => {
  const f = pair();
  let offers = 0,
    answers = 0;
  f.a.mesh.callSignaling = async (_peer, envelope) => {
    offers++;
    await f.b.mesh.receiveCallSignal(f.a.own.key, envelope);
  };
  f.b.mesh.callSignaling = async (_peer, envelope) => {
    answers++;
    await f.a.mesh.receiveCallSignal(f.b.own.key, envelope);
  };
  try {
    await f.a.mesh.prepareOutgoingMedia(f.b.own.key, f.id, f.stream);
    await f.a.mesh.publishPreparedMedia(f.b.own.key, f.id);
    await until(() => offers === 1);
    await pause();
    assert.equal(f.b.state.peers.length, 0, 'ringing caches SDP without a recipient media peer');
    assert.equal(f.a.state.peers[0]!.remoteDescription, null);
    // Acceptance can reach the sender before the camera opens. Preserve the
    // newest accumulated candidates without allocating during this interval.
    f.b.state.call = { ...f.b.state.call, status: 'connecting' };
    await f.b.mesh.receiveCallSignal(f.a.own.key, f.offer(fallback));
    await f.b.mesh.resumeCallMedia(f.a.own.key, f.id);
    assert.equal(f.b.state.peers.length, 0, 'capture must finish before applying an offer');
    f.b.state.call = { ...f.b.state.call, local: f.stream };
    await f.b.mesh.resumeCallMedia(f.a.own.key, f.id);
    await until(() => answers === 1);
    await pause();
    assert.match(f.b.state.peers[0]!.remoteDescription!.sdp!, /candidate:2/);
    assert.equal(
      f.a.state.peers[0]!.remoteDescription,
      null,
      'answer cannot bypass authenticated acceptance',
    );
    f.a.state.call = { ...f.a.state.call, status: 'connecting' };
    await f.a.mesh.startMedia(f.b.own.key, f.id, f.stream);
    await f.a.mesh.resumeCallMedia(f.b.own.key, f.id);
    await until(() => f.a.state.peers[0]!.remoteDescription?.type === 'answer');
    assert.equal(offers, 2, 'acceptance republishes for recipients that discarded early SDP');
    assert.equal(f.a.state.peers.length, 1);
    assert.equal(f.a.state.peers[0]!.offers, 1);
    assert.equal(f.a.state.peers[0]!.gatheringListeners.size, 1);
    assert.equal(f.b.state.peers.length, 1);
    assert.equal(f.b.state.peers[0]!.remoteSets, 1);
    assert.deepEqual([...f.a.state.failures, ...f.b.state.failures], []);
  } finally {
    f.stop();
  }
});

test('an early publication failure racing acceptance retries without duplicate peers or gathering listeners', async () => {
  const f = pair();
  let rejectFirst!: (error: Error) => void;
  let attempts = 0;
  f.a.mesh.callSignaling = async () => {
    attempts++;
    if (attempts === 1)
      await new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      });
  };
  try {
    await f.a.mesh.prepareOutgoingMedia(f.b.own.key, f.id, f.stream);
    await f.a.mesh.publishPreparedMedia(f.b.own.key, f.id);
    await f.a.mesh.publishPreparedMedia(f.b.own.key, f.id);
    await until(() => attempts === 1);
    f.a.state.call = { ...f.a.state.call, status: 'connecting' };
    await f.a.mesh.startMedia(f.b.own.key, f.id, f.stream);
    rejectFirst(new Error('TEMPORARY_DELIVERY_FAILURE'));
    await until(() => attempts === 2);
    await pause();
    assert.deepEqual(f.a.state.failures, []);
    assert.equal(f.a.state.peers.length, 1);
    assert.equal(f.a.state.peers[0]!.offers, 1);
    assert.equal(f.a.state.peers[0]!.gatheringListeners.size, 1);
  } finally {
    f.stop();
  }
});

for (const answered of [true, false]) {
  test(`a failed acceptance resend ${answered ? 'preserves an answered early offer' : 'fails when the recipient still needs the offer'}`, async () => {
    const f = pair();
    let rejectResend!: (error: Error) => void;
    let attempts = 0;
    f.a.mesh.callSignaling = async (_peer, envelope) => {
      if (++attempts === 1) await f.b.mesh.receiveCallSignal(f.a.own.key, envelope);
      else
        await new Promise<void>((_resolve, reject) => {
          rejectResend = reject;
        });
    };
    try {
      await f.a.mesh.prepareOutgoingMedia(f.b.own.key, f.id, f.stream);
      await f.a.mesh.publishPreparedMedia(f.b.own.key, f.id);
      await until(() => attempts === 1);
      await pause();
      if (answered) {
        f.b.state.call = { ...f.b.state.call, status: 'connecting', local: f.stream };
        await f.b.mesh.resumeCallMedia(f.a.own.key, f.id);
        await until(() => f.b.state.peers[0]?.localDescription?.type === 'answer');
        await pause();
      }
      f.a.state.call = { ...f.a.state.call, status: 'connecting' };
      await f.a.mesh.startMedia(f.b.own.key, f.id, f.stream);
      await f.a.mesh.resumeCallMedia(f.b.own.key, f.id);
      await until(() => attempts === 2);
      if (answered) {
        await until(() => f.a.state.peers[0]!.remoteDescription?.type === 'answer');
        f.a.state.call = { ...f.a.state.call, status: 'active' };
      }
      rejectResend(new Error('REDUNDANT_OFFER_DELIVERY_FAILED'));
      await pause();
      assert.deepEqual(f.a.state.failures, answered ? [] : [f.id]);
      assert.equal(f.a.state.peers[0]!.offers, 1);
      assert.equal(f.a.state.peers[0]!.gatheringListeners.size, 1);
    } finally {
      f.stop();
    }
  });
}

test('forged, wrong-peer and wrong-call offers cannot populate a resumable cache', async () => {
  const f = pair();
  try {
    const valid = f.offer();
    await assert.rejects(
      f.b.mesh.receiveCallSignal(f.a.own.key, { ...valid, signature: '0'.repeat(128) }),
      /INVALID/,
    );
    const other = { ...createKeys(randomBytes), name: 'Other contact' };
    await f.b.mesh.receiveCallSignal(other.key, f.offer('', Date.now() + 60000, other));
    await f.b.mesh.receiveCallSignal(
      f.a.own.key,
      f.offer('', Date.now() + 60000, f.a.own, randomUUID()),
    );
    f.b.state.call = { ...f.b.state.call, status: 'connecting', local: f.stream };
    await f.b.mesh.resumeCallMedia(f.a.own.key, f.id);
    await pause();
    assert.equal(f.b.state.peers.length, 0);
  } finally {
    f.stop();
  }
});

for (const reason of ['end', 'expiry', 'blocked', 'replacement', 'stop'] as const) {
  test(`a cached offer cannot allocate media after ${reason}`, async () => {
    const f = pair();
    try {
      await f.b.mesh.receiveCallSignal(
        f.a.own.key,
        f.offer('', Date.now() + (reason === 'expiry' ? 1000 : 60000)),
      );
      await pause();
      if (reason === 'end') f.b.mesh.endMedia(f.a.own.key, f.id);
      if (reason === 'expiry') await pause(1100);
      if (reason === 'blocked') f.b.state.allowed = false;
      if (reason === 'stop') f.b.mesh.stop();
      f.b.state.call = {
        ...f.b.state.call,
        status: 'connecting',
        local: f.stream,
        ...(reason === 'replacement' ? { id: randomUUID() } : {}),
      };
      await f.b.mesh.resumeCallMedia(f.a.own.key, f.b.state.call.id);
      await pause();
      assert.equal(f.b.state.peers.length, 0);
    } finally {
      f.stop();
    }
  });
}

test('a block during initial candidate gathering suppresses early SDP publication', async () => {
  const f = pair();
  let published = 0;
  f.a.mesh.callSignaling = async () => {
    published++;
  };
  try {
    await f.a.mesh.prepareOutgoingMedia(f.b.own.key, f.id, f.stream);
    f.a.state.peers[0]!.iceGatheringState = 'gathering';
    f.a.state.peers[0]!.localDescription!.sdp = sdp().replace(relay, '');
    await f.a.mesh.publishPreparedMedia(f.b.own.key, f.id);
    f.a.state.allowed = false;
    f.a.state.peers[0]!.localDescription!.sdp = sdp();
    f.a.state.peers[0]!.dispatchEvent(new Event('icecandidate'));
    await pause(100);
    assert.equal(published, 0);
  } finally {
    f.stop();
  }
});

test('ringing prepares one relay-only pool without tracks or SDP and reuses it only after acceptance', async () => {
  const f = pair();
  try {
    await Promise.all([
      f.b.mesh.prepareIncomingMedia(f.a.own.key, f.id),
      f.b.mesh.prepareIncomingMedia(f.a.own.key, f.id),
    ]);
    const peer = f.b.state.peers[0]!;
    assert.equal(f.b.state.peers.length, 1);
    assert.equal(f.b.state.configurations[0]!.iceCandidatePoolSize, 1);
    assert.equal(f.b.state.configurations[0]!.iceTransportPolicy, 'relay');
    assert.equal(peer.tracks, 0);
    assert.equal(peer.localDescription, null);
    assert.equal(peer.remoteDescription, null);
    await f.b.mesh.receiveCallSignal(f.a.own.key, f.offer());
    await pause();
    assert.equal(peer.remoteDescription, null, 'early signed SDP still waits for consent');
    f.b.state.call = { ...f.b.state.call, status: 'connecting', local: f.stream };
    await f.b.mesh.resumeCallMedia(f.a.own.key, f.id);
    await until(() => peer.localDescription?.type === 'answer');
    assert.equal(f.b.state.peers.length, 1, 'no second TURN setup after answer');
    f.b.mesh.endMedia(f.a.own.key, f.id);
    assert.equal(peer.connectionState, 'closed');
  } finally {
    f.stop();
  }
});

for (const reason of ['end', 'blocked', 'replacement', 'stop'] as const) {
  test(`pending relay preparation cannot allocate after ${reason}`, async () => {
    let ready!: (configuration: RTCConfiguration) => void;
    const f = pair(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        }),
    );
    try {
      const preparing = f.b.mesh.prepareIncomingMedia(f.a.own.key, f.id);
      if (reason === 'end') f.b.mesh.endMedia(f.a.own.key, f.id);
      if (reason === 'blocked') f.b.state.allowed = false;
      if (reason === 'replacement') f.b.state.call = { ...f.b.state.call, id: randomUUID() };
      if (reason === 'stop') f.b.mesh.stop();
      ready({ iceServers: [], iceTransportPolicy: 'relay' });
      await preparing;
      assert.equal(f.b.state.peers.length, 0);
    } finally {
      f.stop();
    }
  });
}

test('an ended or stopped ringing call releases its idle allocation and a failed preparation falls back', async () => {
  for (const stop of [false, true]) {
    const f = pair();
    try {
      await f.b.mesh.prepareIncomingMedia(f.a.own.key, f.id);
      const peer = f.b.state.peers[0]!;
      if (stop) f.b.mesh.stop();
      else f.b.mesh.endMedia(f.a.own.key, f.id);
      assert.equal(peer.connectionState, 'closed');
    } finally {
      f.stop();
    }
  }
  let attempt = 0;
  const f = pair(async () => {
    if (++attempt === 1) throw new Error('TEMPORARY_TURN_FAILURE');
    return { iceServers: [], iceTransportPolicy: 'relay' };
  });
  try {
    await f.b.mesh.prepareIncomingMedia(f.a.own.key, f.id);
    assert.equal(f.b.state.peers.length, 0);
    f.b.state.call = { ...f.b.state.call, status: 'connecting', local: f.stream };
    await f.b.mesh.receiveCallSignal(f.a.own.key, f.offer());
    await until(() => f.b.state.peers[0]?.localDescription?.type === 'answer');
    assert.deepEqual(f.b.state.failures, []);
  } finally {
    f.stop();
  }
});
