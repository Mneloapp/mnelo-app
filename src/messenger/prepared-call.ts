import { z } from 'zod';
import { packetSchema } from './model';
import type { CallControl, CallMediaState } from './calls';
import { addCallCandidates, gatherCallCandidates } from './call-ice';
import { connectionTiming } from './connection-timing';
import type { Signal, signSignal } from './signaling';

type Envelope = ReturnType<typeof signSignal>;
type Phase = 'transport' | 'media';
const stateSchema = z
  .object({
    v: z.literal(1),
    sharing: z.boolean(),
    camera: z.boolean(),
    muted: z.boolean(),
  })
  .strict();

// Before acceptance the negotiated connection has ONLY an SCTP data channel.
// There are no RTP m-lines, senders, receivers, capture or playback to mute.
export function isDataOnlyDescription(sdp: string) {
  const media = sdp
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('m='));
  return (
    media.length === 1 &&
    /^m=application \d+ (?:UDP\/DTLS\/SCTP|DTLS\/SCTP) /.test(media[0]!) &&
    /^a=(?:sctp-port:|sctpmap:)/m.test(sdp)
  );
}

export class PreparedCall {
  private channel: RTCDataChannel | null = null;
  private selected = false;
  private closed = false;
  private local: MediaStream | null = null;
  private connected = false;
  private activationStarted = false;
  private phase: Phase = 'transport';
  private remotePhase: Phase | null = null;
  private pending: Signal | null = null;
  private signals = new Map<Phase, Signal>();
  private receiving = false;
  private tail = Promise.resolve();
  private sent = '';
  private publishing = false;
  private negotiating = false;
  private deadline: ReturnType<typeof setTimeout>;
  private readonly candidate = () => {
    void this.publish().catch(() => this.fail());
  };
  constructor(
    readonly peer: RTCPeerConnection,
    readonly incoming: boolean,
    private readonly hooks: {
      valid: () => boolean;
      consent: () => boolean;
      send: (phase: Phase, type: 'offer' | 'answer', sdp: string) => Promise<Envelope>;
      signal: (envelope: unknown) => Promise<void>;
      control: (control: CallControl) => Promise<void>;
      remote: (stream: MediaStream) => void;
      state: (state: CallMediaState) => void;
      connected: () => void;
      failed: () => void;
    },
  ) {
    this.deadline = setTimeout(() => this.fail(), 65_000);
    peer.addEventListener('icecandidate', this.candidate);
    peer.addEventListener('icegatheringstatechange', this.candidate);
    peer.addEventListener('datachannel', (event) => this.attach(event.channel));
    peer.addEventListener('track', (event) => {
      if (!this.live() || !this.selected || !hooks.consent() || !this.local) return;
      connectionTiming(event.track.kind === 'video' ? 'REMOTE_VIDEO_TRACK' : 'REMOTE_AUDIO_TRACK');
      if (event.streams[0]) hooks.remote(event.streams[0]);
    });
    peer.addEventListener('connectionstatechange', () => {
      if (!this.live()) return;
      if (peer.connectionState === 'connected') {
        connectionTiming(this.selected ? 'MEDIA_TRANSPORT_CONNECTED' : 'CALL_TRANSPORT_PREPARED');
        this.finish();
      } else if (['failed', 'closed'].includes(peer.connectionState)) this.fail();
    });
  }
  private live() {
    return !this.closed && this.hooks.valid();
  }
  ready() {
    return (
      this.live() &&
      this.peer.connectionState === 'connected' &&
      this.channel?.readyState === 'open' &&
      this.peer.signalingState === 'stable'
    );
  }
  isSelected() {
    return this.selected && this.live();
  }
  select(requireReady: boolean) {
    const preparingIncoming = this.incoming && this.remotePhase === 'transport';
    const offered =
      !this.incoming &&
      this.peer.localDescription?.type === 'offer' &&
      isDataOnlyDescription(this.peer.localDescription.sdp);
    if (
      !this.live() ||
      (!this.selected &&
        (requireReady ? !(this.ready() || preparingIncoming) : !(this.remotePhase || offered)))
    )
      return false;
    if (!this.selected) {
      this.selected = true;
      clearTimeout(this.deadline);
      this.deadline = setTimeout(() => this.fail(), 30_000);
      connectionTiming('CALL_PREPARED_TRANSPORT_SELECTED');
    }
    return true;
  }
  async offer() {
    this.attach(this.peer.createDataChannel('mnelo-call-ready-v1', { ordered: true }));
    this.negotiating = true;
    await this.peer.setLocalDescription(await this.peer.createOffer());
    this.negotiating = false;
    if (!isDataOnlyDescription(this.peer.localDescription?.sdp ?? ''))
      throw new Error('CALL_SIGNAL_INVALID');
    await this.publish();
  }
  // Caller capture was authorized by starting the call; recipient capture is
  // obtained only after answering. Neither is attached to this transport until
  // local acceptance AND the caller's authenticated remote acceptance.
  async activate(stream: MediaStream) {
    if (!this.live() || !this.selected || !this.hooks.consent()) return;
    if (!this.local) {
      this.local = stream;
      for (const track of stream.getTracks()) this.peer.addTrack(track, stream);
    }
    if (this.incoming) {
      if (this.pending) {
        const signal = this.pending;
        this.pending = null;
        this.receive(signal);
      }
    } else {
      // A very quick answer can overtake the initial data-only SDP answer.
      // Reuse that in-flight connection once stable instead of discarding its
      // TURN work or replacing the outstanding offer with a different offer.
      if (!this.remotePhase || this.peer.signalingState !== 'stable') return;
      if (this.activationStarted) return;
      this.activationStarted = true;
      await this.serialize(async () => {
        if (!this.live() || !this.hooks.consent()) return;
        this.negotiating = true;
        await this.peer.setLocalDescription(await this.peer.createOffer());
        this.phase = 'media';
        this.negotiating = false;
        this.sent = '';
        await this.publish();
      });
    }
  }
  receive(signal: Signal) {
    if (!this.live() || !signal.preparation) return;
    this.signals.set(signal.preparation, signal);
    if (this.receiving) return;
    this.receiving = true;
    void this.serialize(async () => {
      while (this.live() && this.signals.size) {
        const phase = this.signals.has('transport') ? 'transport' : 'media';
        const next = this.signals.get(phase)!;
        this.signals.delete(phase);
        await this.apply(next);
      }
    })
      .catch(() => this.fail())
      .finally(() => {
        this.receiving = false;
        const next = this.signals.values().next().value;
        if (next) this.receive(next);
      });
  }
  private serialize(work: () => Promise<void>) {
    const next = this.tail.then(work);
    this.tail = next.catch(() => undefined);
    return next;
  }
  private async apply(signal: Signal) {
    if (!this.live() || signal.expires <= Date.now() || !signal.preparation) return;
    const phase = signal.preparation;
    if (phase === 'transport' && !isDataOnlyDescription(signal.sdp)) return;
    if (phase === 'media' && !/^m=audio /m.test(signal.sdp)) return;
    if (phase === 'transport' && this.remotePhase === 'media') return;
    if (signal.type !== (this.incoming ? 'offer' : 'answer')) return;
    if (phase === 'media' && (!this.selected || !this.hooks.consent())) return;
    if (phase === 'media' && !this.local) {
      this.pending = signal;
      return;
    }
    if (this.remotePhase === phase) {
      await addCallCandidates(this.peer, signal.sdp);
      return;
    }
    if (signal.type === 'answer' && this.peer.signalingState !== 'have-local-offer') return;
    this.negotiating = true;
    await this.peer.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
    if (!this.live()) return;
    this.remotePhase = phase;
    if (signal.type === 'offer') {
      this.phase = phase;
      this.sent = '';
      await this.peer.setLocalDescription(await this.peer.createAnswer());
      this.negotiating = false;
      if (phase === 'transport' && !isDataOnlyDescription(this.peer.localDescription?.sdp ?? '')) {
        this.fail();
        return;
      }
      await this.publish();
    }
    this.negotiating = false;
    this.finish();
    if (phase === 'transport' && !this.incoming && this.selected && this.local)
      void this.activate(this.local).catch(() => this.fail());
  }
  private finish() {
    if (
      this.connected ||
      !this.live() ||
      !this.selected ||
      !this.local ||
      !this.hooks.consent() ||
      this.phase !== 'media' ||
      this.remotePhase !== 'media' ||
      this.peer.signalingState !== 'stable' ||
      this.peer.connectionState !== 'connected'
    )
      return;
    this.connected = true;
    clearTimeout(this.deadline);
    connectionTiming('CALL_PREPARED_MEDIA_READY');
    this.hooks.connected();
  }
  private async publish() {
    if (!this.live() || !this.peer.localDescription || this.publishing || this.negotiating) return;
    this.publishing = true;
    try {
      await gatherCallCandidates(this.peer);
      while (
        this.live() &&
        !this.negotiating &&
        this.peer.localDescription?.sdp &&
        this.sent !== this.phase + this.peer.localDescription.sdp
      ) {
        const { type, sdp } = this.peer.localDescription;
        if (type !== 'offer' && type !== 'answer') return;
        const phase = this.phase;
        if (phase === 'transport' && !isDataOnlyDescription(sdp)) return;
        if (phase === 'media' && !/^m=audio /m.test(sdp)) return;
        if (phase === 'media' && (!this.selected || !this.hooks.consent())) return;
        this.sent = phase + sdp;
        // The encrypted mailbox remains the durable fallback. Once warm, the
        // same signed SDP also travels over the established DTLS data channel.
        await this.hooks.send(phase, type, sdp);
      }
    } finally {
      this.publishing = false;
    }
  }
  sendEnvelope(envelope: Envelope) {
    return this.send({ type: 'signal', envelope });
  }
  sendControl(control: CallControl) {
    if (!this.selected && control.action === 'accept') return false;
    return this.send({ type: 'control', control });
  }
  sendState(state: unknown) {
    if (this.selected) this.send({ type: 'state', state });
  }
  private send(value: unknown) {
    if (
      !this.live() ||
      this.channel?.readyState !== 'open' ||
      this.channel.bufferedAmount > 192_000
    )
      return false;
    try {
      this.channel.send(JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  private attach(channel: RTCDataChannel) {
    if (channel.label !== 'mnelo-call-ready-v1' || this.channel || !this.live()) {
      channel.close();
      return;
    }
    this.channel = channel;
    channel.addEventListener('open', () => {
      if (this.live()) connectionTiming('CALL_PREPARED_CHANNEL_OPEN');
    });
    channel.addEventListener('message', (event) => {
      if (!this.live() || typeof event.data !== 'string' || event.data.length > 145_000) return;
      try {
        const value = JSON.parse(event.data);
        if (value.type === 'signal') void this.hooks.signal(value.envelope).catch(() => undefined);
        else if (value.type === 'control') {
          const control = packetSchema.parse(value.control);
          if (control.type === 'call' && !control.group && control.action !== 'invite')
            void this.hooks.control(control).catch(() => undefined);
        } else if (value.type === 'state' && this.selected && this.hooks.consent())
          this.hooks.state(stateSchema.parse(value.state));
      } catch {
        /* Unrecognized or malformed channel packets have no effect. */
      }
    });
  }
  private fail() {
    const selected = this.selected && this.live();
    this.close();
    if (selected) this.hooks.failed();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.deadline);
    this.pending = null;
    this.signals.clear();
    this.peer.removeEventListener('icecandidate', this.candidate);
    this.peer.removeEventListener('icegatheringstatechange', this.candidate);
    this.channel?.close();
    this.peer.close();
  }
}
