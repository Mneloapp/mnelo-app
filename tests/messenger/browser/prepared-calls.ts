// Isolated real-WebRTC probe. The in-memory queue tests the independent call
// transport boundary, not Signal encryption, APNs, native CallKit or a phone.
import { DeviceCalls, type CallControl } from '../../../src/messenger/calls';
import { PeerMesh } from '../../../src/messenger/peer-mesh';
import { createKeys } from '../../../src/messenger/crypto';
import { readSignal } from '../../../src/messenger/signaling';
import type { DeviceMessenger } from '../../../src/messenger/engine';

const output = document.getElementById('results')!;
const peers: RTCPeerConnection[] = [];
const readyChannels: RTCDataChannel[] = [];
const audio: AudioContext[] = [];
const analysers: AnalyserNode[] = [];
const playback: HTMLAudioElement[] = [];
const rendered = new WeakSet<MediaStream>();
const frames: ReturnType<typeof setInterval>[] = [];
let denyCapture = false;
let captures = 0;
let nextCaptureDelay = 0;
const params = new URLSearchParams(location.search);
const networkDelay = Math.min(500, Math.max(0, Number(params.get('delay') ?? 80)));
const repeats = Math.min(5, Math.max(1, Number(params.get('repeats') ?? 2)));
const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const check = (ok: unknown, label: string) => {
  if (!ok) throw new Error(label);
  output.textContent += 'PASS ' + label + '\n';
};
async function until(predicate: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 35000;
  while (!(await predicate())) {
    if (Date.now() >= deadline) {
      output.textContent +=
        'PEERS ' +
        JSON.stringify(
          peers.map((p) => ({
            connection: p.connectionState,
            ice: p.iceConnectionState,
            signal: p.signalingState,
            localType: p.localDescription?.type,
            remoteType: p.remoteDescription?.type,
            localCandidates: (p.localDescription?.sdp?.match(/a=candidate:/g) || []).length,
            remoteCandidates: (p.remoteDescription?.sdp?.match(/a=candidate:/g) || []).length,
            senders: p.getSenders().length,
            receivers: p.getReceivers().length,
          })),
        ) +
        '\n';
      throw new Error('TIMEOUT ' + label);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  value: async (options: MediaStreamConstraints) => {
    captures++;
    const captureDelay = nextCaptureDelay;
    nextCaptureDelay = 0;
    if (captureDelay) await delay(captureDelay);
    if (denyCapture) {
      denyCapture = false;
      throw new DOMException('Synthetic permission denial', 'NotAllowedError');
    }
    const context = new AudioContext();
    audio.push(context);
    await context.resume();
    const oscillator = context.createOscillator();
    const sink = context.createGain();
    sink.gain.value = 0.00000001;
    oscillator.connect(sink).connect(context.destination);
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
const receivers = new Map<
  string,
  {
    calls: DeviceCalls;
    mesh: PeerMesh;
    receivedOffers: number;
    droppedEarlyOffers: number;
    legacyCallee: boolean;
  }
>();
const queue: (() => Promise<void>)[] = [];
const tcp = params.has('tcp');
async function fetchConfiguration(): Promise<RTCConfiguration> {
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
function fixture(
  name: string,
  mode: 'current' | 'legacy-caller' | 'legacy-callee' | 'cached-baseline' = 'current',
) {
  const identity = { ...createKeys((n) => crypto.getRandomValues(new Uint8Array(n))), name };
  const trusted = new Set<string>();
  const engine = {
    currentIdentity: () => identity,
    acceptsPeer: async (key: string) => trusted.has(key),
    recordCall: async () => {},
  } as unknown as DeviceMessenger;
  let peerCount = 0;
  let cachedConfiguration: Promise<RTCConfiguration> | null = null;
  const configuration = () => (cachedConfiguration ??= fetchConfiguration());
  const mesh = new PeerMesh(
    identity,
    engine,
    'ws://127.0.0.1:1/unused',
    (config) => {
      const peer = new RTCPeerConnection(config);
      peerCount++;
      peers.push(peer);
      peer.addEventListener('icecandidateerror', (event) => {
        output.textContent += 'ICE FAILURE ' + event.errorCode + '\n';
      });
      const createChannel = peer.createDataChannel.bind(peer);
      peer.createDataChannel = (...args) => {
        const channel = createChannel(...args);
        readyChannels.push(channel);
        return channel;
      };
      peer.addEventListener('datachannel', (event) => readyChannels.push(event.channel));
      for (const method of [
        'setLocalDescription',
        'setRemoteDescription',
        'addIceCandidate',
      ] as const) {
        const original = peer[method].bind(peer) as (...args: any[]) => Promise<void>;
        (peer as any)[method] = async (...args: any[]) => {
          try {
            return await original(...args);
          } catch (e) {
            output.textContent += 'NATIVE DESCRIPTION ' + method + ' ' + String(e) + '\n';
            throw e;
          }
        };
      }
      return peer;
    },
    () => crypto.randomUUID(),
    () => {},
    configuration,
    undefined,
    mode === 'current',
  );
  mesh.deliveryWake = () => {};
  mesh.callSignaling = async (peer, envelope) => {
    const desc = readSignal(envelope, peer);
    if (desc?.preparation)
      output.textContent +=
        'SDP ' +
        desc.preparation +
        ' ' +
        desc.type +
        ' ' +
        JSON.stringify({
          media: desc.sdp.split(/\r?\n/).filter((l) => l.startsWith('m=')),
          candidates: (desc.sdp.match(/a=candidate:/g) || []).length,
        }) +
        '\n';
    await delay(networkDelay);
    queue.push(async () => {
      const receiver = receivers.get(peer);
      if (!receiver) return;
      if (readSignal(envelope, peer)?.type === 'offer') receiver.receivedOffers++;
      // Model the build-41 receiver's preaccept discard boundary. This is a
      // compatibility fixture, not execution of the full old native binary.
      if (receiver.legacyCallee && readSignal(envelope, peer)?.preparation) {
        receiver.droppedEarlyOffers++;
        return;
      }
      if (receiver.legacyCallee && receiver.calls.snapshot()?.status === 'incoming') {
        receiver.droppedEarlyOffers++;
        return;
      }
      try {
        await receiver.mesh.receiveCallSignal(identity.key, envelope);
      } catch (e) {
        output.textContent += 'SIGNAL ERROR ' + String(e) + '\n';
        throw e;
      }
    });
  };
  // Retain current capture/accept handling while measuring only the old
  // postaccept offer-publication boundary, not every build-41 behavior.
  if (mode === 'legacy-caller') mesh.publishPreparedMedia = async () => {};
  const calls = new DeviceCalls(engine, mesh, () => crypto.randomUUID(), {
    send: async (peer: string, packet: CallControl) => {
      await delay(networkDelay);
      queue.push(async () => {
        await receivers.get(peer)?.calls.receive(identity.key, packet);
      });
    },
  });
  calls.subscribe(() => {
    const remote = calls.snapshot()?.remote;
    if (!remote || rendered.has(remote)) return;
    rendered.add(remote);
    const element = new Audio();
    element.srcObject = remote;
    element.volume = 0.00000001;
    element.autoplay = true;
    element.hidden = true;
    document.body.append(element);
    playback.push(element);
    void element.play();
    const context = new AudioContext();
    audio.push(context);
    const analyser = context.createAnalyser();
    analysers.push(analyser);
    const gain = context.createGain();
    gain.gain.value = 0.00000001;
    context.createMediaStreamSource(remote).connect(analyser);
    analyser.connect(gain).connect(context.destination);
    void context.resume();
  });
  const receiver = {
    calls,
    mesh,
    receivedOffers: 0,
    droppedEarlyOffers: 0,
    legacyCallee: mode === 'legacy-callee',
  };
  receivers.set(identity.key, receiver);
  return { identity, trusted, mesh, calls, receiver, peerCount: () => peerCount };
}
async function relayMedia(video: boolean) {
  for (const peer of peers.filter((item) => item.connectionState === 'connected')) {
    await until(async () => {
      const stats = await peer.getStats();
      const inbound = [...stats.values()].filter((s) => s.type === 'inbound-rtp');
      return (
        inbound.some((s) => s.kind === 'audio' && s.packetsReceived > 0) &&
        (!video || inbound.some((s) => s.kind === 'video' && s.framesDecoded > 0))
      );
    }, 'bidirectional RTP').catch(async (e) => {
      const stats = await peer.getStats();
      output.textContent +=
        'DIAGNOSTIC ' +
        JSON.stringify({
          localType: peer.localDescription?.type,
          state: peer.connectionState,
          senders: peer.getSenders().map((s) => ({
            kind: s.track?.kind,
            enabled: s.track?.enabled,
            state: s.track?.readyState,
          })),
          transceivers: peer.getTransceivers().map((t) => ({
            direction: t.direction,
            current: t.currentDirection,
            kind: t.receiver.track.kind,
          })),
          stats: [...stats.values()]
            .filter((s) => ['inbound-rtp', 'outbound-rtp'].includes(s.type))
            .map((s) => ({
              type: s.type,
              kind: s.kind,
              packetsSent: s.packetsSent,
              packetsReceived: s.packetsReceived,
              framesDecoded: s.framesDecoded,
            })),
        }) +
        '\n';
      throw e;
    });
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
    'Prepared data transport + actual TURN/WebRTC (' +
    (tcp ? 'TCP' : 'UDP/TCP') +
    ')\n' +
    `Synthetic media, ${networkDelay}ms one-way queue delay; excludes Signal/HTTP, APNs, CallKit and physical iPhones.\n`;
  document.body.dataset.status = 'running';
  const timings: { mode: string; media: string; answerToDecodedMediaMs: number }[] = [];
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
  }, 5);
  async function cleanup(a: ReturnType<typeof fixture>, b: ReturnType<typeof fixture>) {
    a.mesh.stop();
    b.mesh.stop();
    receivers.delete(a.identity.key);
    receivers.delete(b.identity.key);
    queue.length = 0;
    for (const frame of frames.splice(0)) clearInterval(frame);
    for (const element of playback.splice(0)) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    for (const context of audio.splice(0)) await context.close();
    check(
      peers.every((peer) => peer.connectionState === 'closed'),
      'all media peers closed',
    );
    peers.length = 0;
    readyChannels.length = 0;
    analysers.length = 0;
  }
  async function scenario(
    media: 'voice' | 'video',
    mode:
      | 'early'
      | 'postaccept-baseline'
      | 'cached-baseline'
      | 'legacy-callee'
      | 'delayed-capture'
      | 'quick-answer'
      | 'preparing-answer',
  ) {
    const a = fixture(
      'Synthetic A',
      mode === 'postaccept-baseline'
        ? 'legacy-caller'
        : mode === 'cached-baseline'
          ? 'cached-baseline'
          : 'current',
    );
    const b = fixture(
      'Synthetic B',
      mode === 'legacy-callee'
        ? 'legacy-callee'
        : mode === 'cached-baseline'
          ? 'cached-baseline'
          : 'current',
    );
    try {
      a.trusted.add(b.identity.key);
      b.trusted.add(a.identity.key);
      const capturesBefore = captures;
      check(!a.mesh.online(b.identity.key) && !b.mesh.online(a.identity.key), 'no message channel');
      await a.calls.start(b.identity.key, media);
      await until(() => b.calls.snapshot()?.status === 'incoming', media + ' ringing');
      if (mode !== 'postaccept-baseline' && mode !== 'quick-answer')
        await until(() => b.receiver.receivedOffers > 0, 'early signed offer reached recipient');
      else if (mode !== 'quick-answer') await delay(250);
      check(
        b.calls.snapshot()?.local === null &&
          peers
            .filter(
              (p) =>
                p.localDescription?.sdp &&
                /^m=application/m.test(p.localDescription.sdp) &&
                !/^m=audio/m.test(p.localDescription.sdp),
            )
            .every((p) => p.getSenders().length === 0 && p.getReceivers().length === 0) &&
          captures === capturesBefore + 1,
        `${mode} ${media}: no callee capture; prepared transport has zero media senders and receivers`,
      );
      if (mode === 'legacy-callee')
        check(b.receiver.droppedEarlyOffers > 0, 'legacy receiver discarded early offer');
      if (mode === 'postaccept-baseline')
        check(b.receiver.receivedOffers === 0, 'postaccept baseline did not publish early');
      if (mode === 'early' || mode === 'delayed-capture') {
        await until(
          () => peers.filter((p) => p.connectionState === 'connected').length === 2,
          'data-only transports connected while ringing',
        );
        check(
          a.calls.snapshot()?.status === 'ringing' && b.calls.snapshot()?.status === 'incoming',
          'preparation does not answer the call or start either timer',
        );
        const warm = peers.filter((p) => p.connectionState === 'connected');
        check(
          warm.every((p) => p.getSenders().length === 0 && p.getReceivers().length === 0),
          'no RTP in either direction before consent',
        );
        await until(
          () =>
            readyChannels.filter(
              (c) => c.label === 'mnelo-call-ready-v1' && c.readyState === 'open',
            ).length === 2,
          'both prepared control channels open',
        );
      }
      if (mode === 'preparing-answer')
        await until(
          () =>
            peers.some(
              (p) =>
                p.remoteDescription?.type === 'offer' &&
                /^m=application/m.test(p.remoteDescription.sdp) &&
                !/^m=audio/m.test(p.remoteDescription.sdp),
            ),
          'initial data offer accepted before answering',
        );
      if (mode === 'delayed-capture') nextCaptureDelay = 400;
      const preparedTransports = new Map(
        peers
          .filter((p) => p.connectionState === 'connected')
          .map((p) => [
            p,
            {
              dtls: p.sctp?.transport,
              ufrag: p.localDescription?.sdp?.match(/a=ice-ufrag:([^\r\n]+)/)?.[1],
            },
          ]),
      );
      const answeredAt = performance.now();
      await b.calls.accept();
      await until(
        () => a.calls.snapshot()?.status === 'active' && b.calls.snapshot()?.status === 'active',
        media + ' connected',
      );
      await relayMedia(media === 'video');
      for (const p of peers.filter((p) => p.connectionState === 'connected')) {
        const stats = await p.getStats();
        output.textContent +=
          'AUDIO STATS ' +
          JSON.stringify(
            [...stats.values()]
              .filter((s) => ['media-source', 'inbound-rtp'].includes(s.type) && s.kind === 'audio')
              .map((s) => ({
                type: s.type,
                level: s.audioLevel,
                energy: s.totalAudioEnergy,
                samples: s.totalSamplesReceived,
                concealed: s.concealedSamples,
                bytes: s.bytesReceived,
              })),
          ) +
          '\n';
      }
      output.textContent +=
        'AUDIO STATE ' +
        JSON.stringify({
          contexts: audio.map((c) => ({ state: c.state, time: c.currentTime })),
          analysers: analysers.length,
        }) +
        '\n';
      await until(
        () =>
          analysers.length === 2 &&
          analysers.every((node) => {
            const data = new Float32Array(node.fftSize);
            node.getFloatTimeDomainData(data);
            return data.some((value) => Math.abs(value) > 0.001);
          }),
        'generated tone decoded on both sides',
      );
      check(true, 'non-silent synthetic audio decoded in both directions');
      const answerToDecodedMediaMs = Math.round(performance.now() - answeredAt);
      timings.push({ mode, media, answerToDecodedMediaMs });
      if (mode === 'early' || mode === 'delayed-capture')
        check(
          peers.filter((p) => p.connectionState === 'connected').length === 2 &&
            peers
              .filter((p) => p.connectionState === 'connected')
              .every(
                (p) =>
                  p.localDescription?.sdp?.indexOf('m=application') ===
                    p.localDescription?.sdp?.indexOf('m=') &&
                  preparedTransports.get(p)?.dtls ===
                    p.getSenders().find((s) => s.track?.kind === 'audio')?.transport &&
                  preparedTransports.get(p)?.ufrag ===
                    p.localDescription?.sdp?.match(/a=ice-ufrag:([^\r\n]+)/)?.[1],
              ),
          'audio/video reuse the connection whose first m-line is data, without new ICE/DTLS',
        );
      if (mode === 'preparing-answer')
        check(
          peers
            .filter((p) => p.connectionState === 'connected')
            .every(
              (p) =>
                p.localDescription?.sdp?.indexOf('m=application') ===
                p.localDescription?.sdp?.indexOf('m='),
            ),
          'quick acceptance retains the preparing data transport',
        );
      output.textContent += `TIMING ${mode} ${media} answer-to-decoded-media ${answerToDecodedMediaMs}ms\n`;
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
      check(true, mode + ' ' + media + ' hangup reaches recipient');
    } finally {
      await cleanup(a, b);
    }
  }
  try {
    if (params.has('warm')) {
      await scenario('voice', 'early');
      document.body.dataset.status = 'passed';
      return;
    }
    for (let repeat = 0; repeat < repeats; repeat++)
      for (const media of ['voice', 'video'] as const)
        for (const mode of ['cached-baseline', 'early'] as const) await scenario(media, mode);
    for (const media of ['voice', 'video'] as const) {
      await scenario(media, 'legacy-callee');
      await scenario(media, 'delayed-capture');
      await scenario(media, 'quick-answer');
      await scenario(media, 'preparing-answer');
    }
    const a = fixture('Synthetic decline A'),
      b = fixture('Synthetic decline B');
    try {
      a.trusted.add(b.identity.key);
      b.trusted.add(a.identity.key);
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
    } finally {
      await cleanup(a, b);
    }
    check(!failure, 'queued control and signed SDP delivery without processing failures');
    output.textContent += 'MEASUREMENTS ' + JSON.stringify(timings) + '\n';
    output.textContent += 'COMPLETE\n';
    document.body.dataset.status = 'passed';
  } catch (error) {
    output.textContent += 'FAIL ' + (error instanceof Error ? error.message : 'UNKNOWN') + '\n';
    document.body.dataset.status = 'failed';
  } finally {
    clearInterval(timer);
    queue.length = 0;
    for (const receiver of receivers.values()) receiver.mesh.stop();
    receivers.clear();
    for (const frame of frames) clearInterval(frame);
    for (const element of playback.splice(0)) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    for (const context of audio) await context.close();
  }
}
document.getElementById('run')!.addEventListener('click', () => void run());
