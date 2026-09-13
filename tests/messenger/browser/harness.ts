// Isolated development-only transport test. Never imported by the mobile application.
import { createKeys, directChatId } from '../../../src/messenger/crypto';
import { PeerMesh } from '../../../src/messenger/peer-mesh';
import { DeviceCalls } from '../../../src/messenger/calls';
import type { DeviceMessenger } from '../../../src/messenger/engine';
import { packetSchema, type Packet } from '../../../src/messenger/model';
const results = document.getElementById('results')!;
const expect = (ok: unknown, name: string) => {
  if (!ok) throw new Error(name);
  results.textContent += 'PASS ' + name + '\n';
};
const until = async (check: () => boolean, name: string) => {
  const deadline = Date.now() + 35000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('TIMEOUT ' + name);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};
const peers: RTCPeerConnection[] = [];
const hosted = new URLSearchParams(location.search).has('hosted');
const tcpOnly = new URLSearchParams(location.search).has('tcp');
const configuration = async (): Promise<RTCConfiguration> => {
  if (!hosted) return { iceServers: [] };
  const response = await fetch('/ice', { cache: 'no-store' });
  if (!response.ok) throw new Error('QA_ICE_UNAVAILABLE');
  const config = await response.json();
  if (config.expires <= Date.now()) throw new Error('QA_ICE_EXPIRED');
  if (tcpOnly)
    config.iceServers[0].urls = config.iceServers[0].urls.filter((url: string) =>
      url.endsWith('transport=tcp'),
    );
  return { iceServers: config.iceServers, iceTransportPolicy: 'relay', bundlePolicy: 'max-bundle' };
};
async function verifyRelayCandidates() {
  if (!hosted) return;
  for (const peer of peers.filter((p) => p.connectionState === 'connected')) {
    const stats = await peer.getStats();
    const transport = [...stats.values()].find(
      (s) => s.type === 'transport' && s.selectedCandidatePairId,
    );
    const pair = transport && stats.get(transport.selectedCandidatePairId);
    expect(
      pair &&
        stats.get(pair.localCandidateId)?.candidateType === 'relay' &&
        stats.get(pair.remoteCandidateId)?.candidateType === 'relay',
      'selected candidate pair is relay/relay',
    );
  }
}
const fixture = (name: string) => {
  const identity = { ...createKeys((size) => crypto.getRandomValues(new Uint8Array(size))), name };
  const trusted = new Set<string>();
  const received: Packet[] = [];
  const engine = {
    currentIdentity: () => identity,
    async contacts() {
      return [...trusted].map((key) => ({ key, name: 'Development peer', blocked: false }));
    },
    async acceptsPeer(key: string) {
      return trusted.has(key);
    },
    async flush() {},
    async recordCall() {},
    async receive(_key: string, packet: Packet) {
      received.push(packet);
      if (packet.type === 'message') mesh.send(_key, { type: 'ack', id: packet.id });
      return true;
    },
  };
  const mesh = new PeerMesh(
    identity,
    engine as unknown as DeviceMessenger,
    hosted ? 'wss://relay-dev.mnelo.com/' : 'ws://127.0.0.1:8084',
    (configuration) => {
      const peer = new RTCPeerConnection(configuration);
      peers.push(peer);
      return peer;
    },
    () => crypto.randomUUID(),
    () => {},
    configuration,
  );
  const calls = new DeviceCalls(engine as unknown as DeviceMessenger, mesh, () =>
    crypto.randomUUID(),
  );
  return { identity, trusted, received, mesh, calls };
};
const audioContexts: AudioContext[] = [];
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  value: async (options: MediaStreamConstraints) => {
    const audio = new AudioContext();
    audioContexts.push(audio);
    await audio.resume();
    const oscillator = audio.createOscillator();
    const destination = audio.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    const stream = new MediaStream(destination.stream.getAudioTracks());
    if (options.video) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 160, 120);
      const video = canvas.captureStream(10);
      for (const track of video.getVideoTracks()) stream.addTrack(track);
    }
    return stream;
  },
});
async function run() {
  results.textContent = 'Development-only real WebRTC transport checks\n';
  const a = fixture('Development A'),
    b = fixture('Development B');
  try {
    a.trusted.add(b.identity.key);
    b.trusted.add(a.identity.key);
    a.mesh.start();
    b.mesh.start();
    await until(
      () => a.mesh.online(b.identity.key) && b.mesh.online(a.identity.key),
      'authenticated peer channel',
    );
    expect(true, 'pinned-key signed SDP opens two DTLS data channels');
    await verifyRelayCandidates();
    const packet: Packet = {
      type: 'message',
      id: crypto.randomUUID(),
      chat: 'development-only',
      sentAt: Date.now(),
      kind: 'text',
      body: 'Development real WebRTC text',
      media: null,
      replyTo: null,
    };
    expect(a.mesh.send(b.identity.key, packet), 'transport accepted text');
    await until(() => b.received.length === 1, 'text received');
    expect(b.received[0]?.type === 'message', 'peer receives text');
    const large = {
      ...packet,
      id: crypto.randomUUID(),
      kind: 'file' as const,
      body: '',
      media: {
        name: 'development.txt',
        mime: 'text/plain',
        bytes: btoa('x'.repeat(80000)),
        duration: null,
      },
    };
    expect(a.mesh.send(b.identity.key, large), 'transport accepted chunked file');
    await until(() => b.received.length === 2, 'file reassembled');
    expect(
      JSON.stringify(b.received[1]) === JSON.stringify(packetSchema.parse(large)),
      'chunked file reassembles intact',
    );
    for (const media of ['voice', 'video'] as const) {
      await a.calls.start(b.identity.key, media);
      await until(() => b.calls.snapshot()?.status === 'incoming', media + ' ringing');
      expect(
        b.calls.snapshot()?.local === null,
        'incoming ' + media + ' does not capture before accept',
      );
      await b.calls.accept();
      await until(
        () => a.calls.snapshot()?.status === 'active' && b.calls.snapshot()?.status === 'active',
        media + ' call active',
      );
      expect(
        Boolean(b.calls.snapshot()?.remote?.getAudioTracks().length),
        media + ' authenticated remote audio track',
      );
      await verifyRelayCandidates();
      if (media === 'video')
        expect(
          Boolean(b.calls.snapshot()?.remote?.getVideoTracks().length),
          'authenticated remote video track',
        );
      a.calls.mute();
      expect(
        a.calls
          .snapshot()
          ?.local?.getAudioTracks()
          .every((track) => !track.enabled),
        'mute disables source track',
      );
      await a.calls.end();
      await until(() => b.calls.snapshot()?.status === 'ended', 'remote call ended');
      expect(true, media + ' hangup reaches peer');
    }
    await a.calls.start(b.identity.key, 'voice');
    await until(() => b.calls.snapshot()?.status === 'incoming', 'reject ringing');
    await b.calls.end();
    await until(() => a.calls.snapshot()?.status === 'ended', 'reject propagates');
    expect(true, 'recipient decline');
    b.trusted.delete(a.identity.key);
    await b.mesh.enforceContacts();
    await until(() => !a.mesh.online(b.identity.key), 'block closes channel');
    expect(!a.mesh.send(b.identity.key, packet), 'blocked peer cannot send after channel removal');
    results.textContent += 'COMPLETE\n';
    document.body.dataset.status = 'passed';
  } catch (error) {
    results.textContent += 'FAIL ' + (error instanceof Error ? error.message : 'unknown') + '\n';
    document.body.dataset.status = 'failed';
  } finally {
    a.mesh.stop();
    b.mesh.stop();
    for (const audio of audioContexts) await audio.close();
  }
}
document.getElementById('run')!.addEventListener('click', () => void run());

// Interactive bridge for simulator/device QA. Keys are generated in this page only.
const nativeSection = document.createElement('section');
nativeSection.innerHTML =
  '<h2>Native device bridge — development only</h2><label>Native public code <input id="native-key"></label><button id="start-native">Start test peer</button><pre id="native-code"></pre><pre id="native-status"></pre><button id="native-send">Send development text</button><button id="native-call">Call native device</button><button id="native-accept">Accept native call</button><button id="native-end">End native call</button>';
document.body.append(nativeSection);
let native: ReturnType<typeof fixture> | null = null;
let nativeKey = '';
document.getElementById('start-native')!.addEventListener('click', () => {
  native?.mesh.stop();
  native = fixture('Development browser');
  nativeKey = (document.getElementById('native-key') as HTMLInputElement).value
    .replace(/^mnelo1:/, '')
    .trim();
  if (!/^[a-f0-9]{64}$/.test(nativeKey)) throw new Error('TEST_PUBLIC_CODE_INVALID');
  native.trusted.add(nativeKey);
  native.mesh.start();
  document.getElementById('native-code')!.textContent = 'mnelo1:' + native.identity.key;
});
document.getElementById('native-send')!.addEventListener('click', () => {
  if (!native) return;
  native.mesh.send(nativeKey, {
    type: 'message',
    id: crypto.randomUUID(),
    chat: directChatId(native.identity.key, nativeKey),
    sentAt: Date.now(),
    kind: 'text',
    body: 'Development message from the real browser peer',
    media: null,
    replyTo: null,
  });
});
document
  .getElementById('native-call')!
  .addEventListener('click', () => void native?.calls.start(nativeKey, 'voice'));
document
  .getElementById('native-accept')!
  .addEventListener('click', () => void native?.calls.accept());
document.getElementById('native-end')!.addEventListener('click', () => void native?.calls.end());
setInterval(() => {
  if (native)
    document.getElementById('native-status')!.textContent = JSON.stringify({
      online: native.mesh.online(nativeKey),
      received: native.received.map((packet) => packet.type),
      call: native.calls.snapshot()?.status,
      remoteAudio: native.calls.snapshot()?.remote?.getAudioTracks().length,
      remoteVideo: native.calls.snapshot()?.remote?.getVideoTracks().length,
    });
}, 500);
