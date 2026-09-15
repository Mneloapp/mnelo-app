// Isolated real-WebRTC probe. The in-memory queue tests the independent call
// transport boundary, not Signal encryption, APNs, native CallKit or a phone.
import { DeviceCalls, type CallControl } from '../../../src/messenger/calls';
import { PeerMesh } from '../../../src/messenger/peer-mesh';
import { createKeys } from '../../../src/messenger/crypto';
import type { DeviceMessenger } from '../../../src/messenger/engine';

const output = document.getElementById('results')!;
const peers: RTCPeerConnection[] = [];
const audio: AudioContext[] = [];
const frames: ReturnType<typeof setInterval>[] = [];
let denyCapture = false;
const check = (ok: unknown, label: string) => {
  if (!ok) throw new Error(label);
  output.textContent += 'PASS ' + label + '\n';
};
async function until(predicate: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 35000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error('TIMEOUT ' + label);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  value: async (options: MediaStreamConstraints) => {
    if (denyCapture) {
      denyCapture = false;
      throw new DOMException('Synthetic permission denial', 'NotAllowedError');
    }
    const context = new AudioContext();
    audio.push(context);
    await context.resume();
    const oscillator = context.createOscillator();
    const destination = context.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    const stream = new MediaStream(destination.stream.getAudioTracks());
    if (options.video) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 120;
      const drawing = canvas.getContext('2d')!;
      let bright = false;
      // A static offscreen canvas can stop producing frames after negotiation.
      // Keep this synthetic source live; no real camera is opened by the probe.
      frames.push(
        setInterval(() => {
          bright = !bright;
          drawing.fillStyle = bright ? '#333' : '#111';
          drawing.fillRect(0, 0, 160, 120);
        }, 100),
      );
      for (const track of canvas.captureStream(10).getTracks()) stream.addTrack(track);
    }
    return stream;
  },
});
const receivers = new Map<string, { calls: DeviceCalls; mesh: PeerMesh }>();
const queue: (() => Promise<void>)[] = [];
const tcp = new URLSearchParams(location.search).has('tcp');
async function configuration(): Promise<RTCConfiguration> {
  const response = await fetch('/ice', { cache: 'no-store' });
  if (!response.ok) throw new Error('QA_TURN_REQUIRED');
  const value = await response.json();
  if (value.expires <= Date.now()) throw new Error('QA_TURN_EXPIRED');
  if (tcp)
    value.iceServers[0].urls = value.iceServers[0].urls.filter((s: string) =>
      s.endsWith('transport=tcp'),
    );
  return { iceServers: value.iceServers, iceTransportPolicy: 'relay', bundlePolicy: 'max-bundle' };
}
function fixture(name: string) {
  const identity = { ...createKeys((n) => crypto.getRandomValues(new Uint8Array(n))), name };
  const trusted = new Set<string>();
  const engine = {
    currentIdentity: () => identity,
    acceptsPeer: async (key: string) => trusted.has(key),
    recordCall: async () => {},
  } as unknown as DeviceMessenger;
  const mesh = new PeerMesh(
    identity,
    engine,
    'ws://127.0.0.1:1/unused',
    (config) => {
      const peer = new RTCPeerConnection(config);
      peers.push(peer);
      return peer;
    },
    () => crypto.randomUUID(),
    () => {},
    configuration,
  );
  mesh.deliveryWake = () => {};
  mesh.callSignaling = async (peer, envelope) => {
    queue.push(() => receivers.get(peer)!.mesh.receiveCallSignal(identity.key, envelope));
  };
  const calls = new DeviceCalls(engine, mesh, () => crypto.randomUUID(), {
    send: async (peer: string, packet: CallControl) => {
      queue.push(() => receivers.get(peer)!.calls.receive(identity.key, packet));
    },
  });
  receivers.set(identity.key, { calls, mesh });
  return { identity, trusted, mesh, calls };
}
async function relayMedia(video: boolean) {
  for (const peer of peers.filter((item) => item.connectionState === 'connected')) {
    await until(async () => {
      const stats = await peer.getStats();
      return [...stats.values()].some(
        (s) =>
          s.type === 'inbound-rtp' &&
          s.kind === (video ? 'video' : 'audio') &&
          (video ? s.framesDecoded > 0 : s.packetsReceived > 0),
      );
    }, 'bidirectional RTP');
    const stats = await peer.getStats();
    const transport = [...stats.values()].find((s) => s.selectedCandidatePairId);
    const pair = transport && stats.get(transport.selectedCandidatePairId);
    check(
      pair &&
        stats.get(pair.localCandidateId)?.candidateType === 'relay' &&
        stats.get(pair.remoteCandidateId)?.candidateType === 'relay',
      'selected relay/relay candidate pair',
    );
  }
}
async function run() {
  output.textContent =
    'Independent queued controls + actual TURN/WebRTC (' + (tcp ? 'TCP' : 'UDP/TCP') + ')\n';
  document.body.dataset.status = 'running';
  const a = fixture('Synthetic A'),
    b = fixture('Synthetic B');
  let busy = false,
    failure: unknown;
  const timer = setInterval(() => {
    if (busy) return;
    const next = queue.shift();
    if (!next) return;
    busy = true;
    void next()
      .catch((error) => {
        failure = error;
      })
      .finally(() => {
        busy = false;
      });
  }, 25);
  try {
    a.trusted.add(b.identity.key);
    b.trusted.add(a.identity.key);
    check(
      !a.mesh.online(b.identity.key) && !b.mesh.online(a.identity.key),
      'no message data channel or signaling socket',
    );
    for (const media of ['voice', 'video'] as const) {
      await a.calls.start(b.identity.key, media);
      await until(() => b.calls.snapshot()?.status === 'incoming', media + ' ringing');
      check(b.calls.snapshot()?.local === null, media + ' no capture before accept');
      const answeredAt = performance.now();
      await b.calls.accept();
      await until(
        () => a.calls.snapshot()?.status === 'active' && b.calls.snapshot()?.status === 'active',
        media + ' connected',
      );
      await relayMedia(media === 'video');
      check(true, media + ' bidirectional RTP received');
      output.textContent +=
        'TIMING ' + media + ' answer-to-RTP ' + Math.round(performance.now() - answeredAt) + 'ms\n';
      a.calls.mute();
      check(
        a.calls
          .snapshot()
          ?.local?.getAudioTracks()
          .every((track) => !track.enabled),
        media + ' mute',
      );
      await a.calls.end();
      await until(() => b.calls.snapshot()?.status === 'ended', media + ' hangup');
      check(true, media + ' hangup reaches recipient');
    }
    await a.calls.start(b.identity.key, 'voice');
    await until(() => b.calls.snapshot()?.status === 'incoming', 'decline ringing');
    await b.calls.end();
    await until(() => a.calls.snapshot()?.status === 'ended', 'decline propagated');
    check(true, 'decline reaches caller');
    denyCapture = true;
    let denied = false;
    try {
      await a.calls.start(b.identity.key, 'voice');
    } catch {
      denied = true;
    }
    check(
      denied && a.calls.snapshot()?.status === 'failed',
      'permission denial fails without capture',
    );
    check(!failure, 'queued control and signed SDP delivery without processing failures');
    check(
      peers.every((peer) => peer.connectionState === 'closed'),
      'all media peers closed',
    );
    output.textContent += 'COMPLETE\n';
    document.body.dataset.status = 'passed';
  } catch (error) {
    output.textContent += 'FAIL ' + (error instanceof Error ? error.message : 'UNKNOWN') + '\n';
    document.body.dataset.status = 'failed';
  } finally {
    clearInterval(timer);
    queue.length = 0;
    a.mesh.stop();
    b.mesh.stop();
    for (const frame of frames) clearInterval(frame);
    for (const context of audio) await context.close();
  }
}
document.getElementById('run')!.addEventListener('click', () => void run());
