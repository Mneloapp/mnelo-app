import { observeMediaTiming } from './media-timing';
import { connectionTiming } from './connection-timing';
import { z } from 'zod';
import { authenticationPayload, readSignal, signSignal, type Signal } from './signaling';
import { sign } from './crypto';
import {
  packetSchema,
  peerKey,
  type LocalIdentity,
  type Packet,
  type PeerTransport,
} from './model';
import type { DeviceMessenger } from './engine';
import type { DeviceCalls } from './calls';
import type { DeviceWake } from './wake-client';
import { wakeGrantPacket } from './wake-protocol';
import { bindProfileChannel } from './profile-channel';
import { gatherCallCandidates, addCallCandidates } from './call-ice';

type Link = {
  receiveTail: Promise<void>;
  queuedBytes: number;
  peer: RTCPeerConnection;
  session: string;
  channel: RTCDataChannel | null;
  wakeChannel: RTCDataChannel | null;
  profileChannel: RTCDataChannel | null;
  stopProfile: (() => void) | null;
  deadline: ReturnType<typeof setTimeout>;
  pump: ReturnType<typeof setTimeout> | null;
  incoming: {
    id: string;
    next: number;
    total: number;
    parts: string[];
    length: number;
    expires: number;
  } | null;
  outgoing: boolean;
};
const chunkSchema = z
  .object({
    type: z.literal('chunk'),
    id: z.string().uuid(),
    index: z.number().int().min(0),
    total: z.number().int().min(1).max(1250),
    text: z.string().max(12_000),
  })
  .strict();
const responseSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('challenge'), nonce: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('delivery') }).strict(),
  z.object({ type: z.literal('presence'), peer: peerKey, online: z.boolean() }).strict(),
  z.object({ type: z.literal('unavailable'), peer: peerKey }).strict(),
  z.object({ type: z.literal('signal'), envelope: z.unknown() }).strict(),
]);

export class PeerMesh implements PeerTransport {
  // When set, message presence/probing and old data channels are disabled.
  // The authenticated socket carries only a wake hint for the durable mailbox.
  deliveryWake: (() => void) | null = null;
  callSignaling: ((peer: string, envelope: ReturnType<typeof signSignal>) => Promise<void>) | null =
    null;
  calls: DeviceCalls | null = null;
  wake: DeviceWake | null = null;
  private videoReplacement = Promise.resolve();
  private preparedMedia = new Map<string, { id: string; ready: Promise<RTCPeerConnection> }>();
  private mediaLinks = new Map<
    string,
    {
      peer: RTCPeerConnection;
      id: string;
      deadline: ReturnType<typeof setTimeout>;
      state?: RTCDataChannel;
      stopGathering?: () => void;
      stopStats?: () => void;
    }
  >();
  private socket: WebSocket | null = null;
  private links = new Map<string, Link>();
  private stopped = false;
  private pendingLinks = new Map<string, string>();
  private pendingMedia = new Map<string, string>();
  private seenSignals = new Map<string, number>();
  private ready = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private probing = false;
  private introductionAttempts = new Map<string, number>();
  private introductionPending = new Set<string>();
  private probeOffset = 0;
  private preferred: string | null = null;
  async focus(remote: string) {
    if (this.deliveryWake) {
      this.deliveryWake();
      return;
    }
    if (!(await this.engine.acceptsPeer(remote))) return;
    this.preferred = remote;
    if (!this.links.has(remote) && this.links.size >= 16) {
      const idle = [...this.links.keys()].find((key) => key !== this.calls?.snapshot()?.peer);
      if (idle) this.remove(idle);
    }
    if (!this.links.has(remote)) this.sendSignal({ type: 'probe', to: remote });
  }
  constructor(
    private readonly own: LocalIdentity,
    private readonly engine: DeviceMessenger,
    private readonly url: string,
    private readonly factory: (configuration: RTCConfiguration) => RTCPeerConnection,
    private readonly uuid: () => string,
    private readonly changed: () => void,
    private readonly configuration: () => Promise<RTCConfiguration> = async () => ({
      iceServers: [],
      bundlePolicy: 'max-bundle',
    }),
    private readonly verifyIntroduction?: (phone: string, peer: string) => Promise<boolean>,
  ) {}
  start() {
    this.stopped = false;
    this.connect();
  }
  online(peer: string) {
    return this.links.get(peer)?.channel?.readyState === 'open';
  }
  async waitForPeer(peer: string, valid: () => boolean, timeout = 45000) {
    const until = Date.now() + timeout;
    while (!this.stopped && valid() && Date.now() < until) {
      if (!(await this.engine.acceptsPeer(peer))) throw new Error('CONTACT_BLOCKED');
      if (this.online(peer)) return;
      await this.focus(peer);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('CALL_UNAVAILABLE');
  }
  async enforceContacts() {
    await this.calls?.enforceMembership();
    for (const peer of new Set([
      ...this.links.keys(),
      ...this.mediaLinks.keys(),
      ...this.pendingLinks.keys(),
      ...this.pendingMedia.keys(),
    ])) {
      if (!(await this.engine.acceptsPeer(peer))) {
        const call = this.calls?.snapshot();
        if (call?.peer === peer) await this.calls?.end();
        this.remove(peer);
        const media = this.mediaLinks.get(peer);
        if (media) this.endMedia(peer, media.id);
        this.pendingMedia.delete(peer);
      }
    }
  }
  private connect() {
    if (this.stopped) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onmessage = (event) => {
      if (socket !== this.socket || typeof event.data !== 'string' || event.data.length > 96_000)
        return;
      void this.receiveSignal(event.data).catch(() => {
        socket.close();
      });
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.ready = false;
      this.socket = null;
      if (this.poll) clearInterval(this.poll);
      this.poll = null;
      // Existing authenticated direct channels may continue without signaling.
      if (!this.stopped)
        this.retry = setTimeout(() => {
          this.retry = null;
          this.connect();
        }, 5000);
      this.changed();
    };
  }
  private sendSignal(value: unknown) {
    if (
      this.socket?.readyState === WebSocket.OPEN &&
      (typeof this.socket.bufferedAmount !== 'number' || this.socket.bufferedAmount < 192_000)
    )
      this.socket.send(JSON.stringify(value));
  }
  private async receiveSignal(text: string) {
    const parsed = responseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return;
    const value = parsed.data;
    if (value.type === 'challenge') {
      this.sendSignal({
        type: 'auth',
        key: this.own.key,
        signature: sign(this.own.secret, authenticationPayload(this.own.key, value.nonce)),
      });
      return;
    }
    if (value.type === 'ready') {
      this.ready = true;
      if (this.deliveryWake) {
        this.deliveryWake();
        return;
      }
      await this.probe();
      if (!this.stopped && !this.poll)
        this.poll = setInterval(() => {
          void this.probe().catch(() => undefined);
        }, 10_000);
      return;
    }
    if (value.type === 'delivery') {
      this.deliveryWake?.();
      return;
    }
    if (this.deliveryWake) return; // Never downgrade a migrated client to live JSON packets.
    if (value.type === 'presence') {
      if (
        value.online &&
        !this.links.has(value.peer) &&
        (await this.engine.acceptsPeer(value.peer))
      )
        await this.offer(value.peer);
      return;
    }
    if (value.type !== 'signal') return;
    const signal = readSignal(value.envelope, this.own.key);
    if (!signal) return;
    if (!(await this.engine.acceptsPeer(signal.from))) {
      await this.receiveIntroduction(signal);
      return;
    }
    for (const [id, expires] of this.seenSignals)
      if (expires <= Date.now()) this.seenSignals.delete(id);
    const signalId = [signal.from, signal.session, signal.purpose, signal.type].join(':');
    if (this.seenSignals.has(signalId) || this.seenSignals.size >= 1024) return;
    this.seenSignals.set(signalId, signal.expires);
    if (signal.purpose === 'call') {
      await this.mediaSignal(signal);
      return;
    }
    if (signal.type === 'offer') {
      // Either device may initiate. The lower public key wins simultaneous offers.
      const existing = this.links.get(signal.from);
      if (existing || this.pendingLinks.has(signal.from)) {
        if (existing?.channel?.readyState === 'open' || signal.from > this.own.key) return;
        this.remove(signal.from);
      }
      const link = await this.createLink(signal.from, signal.session);
      if (!link) return;
      try {
        await link.peer.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        await link.peer.setLocalDescription(await link.peer.createAnswer());
        await this.gather(link.peer);
        this.publish(signal.from, link, 'answer');
      } catch {
        if (this.links.get(signal.from) === link) this.remove(signal.from);
      }
    } else {
      const link = this.links.get(signal.from);
      if (
        !link ||
        link.session !== signal.session ||
        link.peer.signalingState !== 'have-local-offer'
      )
        return;
      try {
        await link.peer.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      } catch {
        if (this.links.get(signal.from) === link) this.remove(signal.from);
      }
    }
  }
  private async receiveIntroduction(signal: Signal) {
    if (
      !this.verifyIntroduction ||
      signal.type !== 'offer' ||
      signal.purpose === 'call' ||
      !signal.introduction ||
      this.stopped
    )
      return;
    const now = Date.now();
    for (const [key, expires] of this.introductionAttempts)
      if (expires <= now) this.introductionAttempts.delete(key);
    if (
      this.introductionAttempts.has(signal.from) ||
      this.introductionAttempts.size >= 8 ||
      this.introductionPending.size >= 2
    )
      return;
    this.introductionAttempts.set(signal.from, now + 60000);
    this.introductionPending.add(signal.from);
    try {
      // A signed offer alone does not prove ownership of the claimed phone.
      // Lookup uses the recipient's authenticated directory access/cohort policy.
      if ((await this.engine.contacts()).some((c) => c.key === signal.from)) return;
      if ((await this.engine.contactRequests()).some((c) => c.public_key === signal.from)) return;
      if (!(await this.verifyIntroduction(signal.introduction, signal.from)) || this.stopped)
        return;
      await this.engine.receiveContactRequest(signal.from, signal.introduction);
    } catch {
      // A failed/rate-limited directory lookup must not tear down existing chats.
      return;
    } finally {
      this.introductionPending.delete(signal.from);
    }
  }
  private async probe() {
    if (!this.ready || this.probing || this.stopped) return;
    this.probing = true;
    try {
      const contacts = await this.engine.contacts();
      const batch = contacts.slice(this.probeOffset, this.probeOffset + 16);
      this.probeOffset = this.probeOffset + 16 >= contacts.length ? 0 : this.probeOffset + 16;
      for (const key of this.links.keys()) if (this.online(key)) await this.engine.flush(key);
      if (this.preferred && !this.links.has(this.preferred))
        this.sendSignal({ type: 'probe', to: this.preferred });
      for (const contact of batch) {
        if (contact.blocked) {
          this.remove(contact.key);
          continue;
        }
        if (this.online(contact.key)) await this.engine.flush(contact.key);
        else if (!this.links.has(contact.key)) this.sendSignal({ type: 'probe', to: contact.key });
      }
    } finally {
      this.probing = false;
    }
  }
  private async createLink(remote: string, session: string): Promise<Link | null> {
    if (
      this.links.size + this.pendingLinks.size >= 16 ||
      this.stopped ||
      this.links.has(remote) ||
      this.pendingLinks.has(remote)
    )
      return null;
    this.pendingLinks.set(remote, session);
    let peer: RTCPeerConnection;
    try {
      const configuration = await this.configuration();
      const accepted = await this.engine.acceptsPeer(remote);
      if (this.stopped || !accepted || this.pendingLinks.get(remote) !== session) return null;
      peer = this.factory(configuration);
    } catch {
      return null;
    } finally {
      if (this.pendingLinks.get(remote) === session) this.pendingLinks.delete(remote);
    }
    const link: Link = {
      receiveTail: Promise.resolve(),
      queuedBytes: 0,
      peer,
      session,
      channel: null,
      wakeChannel: null,
      profileChannel: null,
      stopProfile: null,
      deadline: setTimeout(() => {
        if (this.links.get(remote) === link && !this.online(remote)) this.remove(remote);
      }, 25_000),
      pump: null,
      incoming: null,
      outgoing: false,
    };
    this.links.set(remote, link);
    peer.addEventListener('datachannel', (event) =>
      event.channel.label === 'mnelo-profile-v1'
        ? this.bindProfile(remote, link, event.channel)
        : event.channel.label === 'mnelo-wake-v1'
          ? this.bindWakeChannel(remote, link, event.channel)
          : this.bindChannel(remote, link, event.channel),
    );
    peer.addEventListener('connectionstatechange', () => {
      if (this.links.get(remote) === link && ['closed', 'failed'].includes(peer.connectionState))
        this.remove(remote);
      this.changed();
    });
    return link;
  }
  private async offer(remote: string) {
    const link = await this.createLink(remote, this.uuid());
    if (!link) return;
    try {
      this.bindChannel(remote, link, link.peer.createDataChannel('mnelo-v1', { ordered: true }));
      this.bindWakeChannel(
        remote,
        link,
        link.peer.createDataChannel('mnelo-wake-v1', { ordered: true }),
      );
      this.bindProfile(
        remote,
        link,
        link.peer.createDataChannel('mnelo-profile-v1', { ordered: true }),
      );
      await link.peer.setLocalDescription(await link.peer.createOffer());
      await this.gather(link.peer);
      this.publish(remote, link, 'offer');
    } catch {
      if (this.links.get(remote) === link) this.remove(remote);
    }
  }
  private gather(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        peer.removeEventListener('icegatheringstatechange', update);
        reject(new Error('ICE_TIMEOUT'));
      }, 10_000);
      const update = () => {
        if (peer.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          peer.removeEventListener('icegatheringstatechange', update);
          resolve();
        }
      };
      peer.addEventListener('icegatheringstatechange', update);
      update();
    });
  }
  private publish(remote: string, link: Link, type: Signal['type']) {
    if (this.links.get(remote) !== link || !link.peer.localDescription?.sdp) return;
    const body: Signal = {
      protocol: 'mnelo-dtls-v1',
      from: this.own.key,
      to: remote,
      session: link.session,
      expires: Date.now() + 120_000,
      type,
      sdp: link.peer.localDescription.sdp,
    };
    // Send the base envelope too: build 9 validates a strict signal schema and
    // ignores the extended introduction. Never break established older peers.
    const phone = this.engine.currentEnrollment()?.phone;
    if (type === 'offer' && this.verifyIntroduction && phone)
      this.sendSignal({
        type: 'signal',
        to: remote,
        envelope: signSignal(this.own.secret, { ...body, introduction: phone }),
      });
    this.sendSignal({ type: 'signal', to: remote, envelope: signSignal(this.own.secret, body) });
  }
  private bindProfile(remote: string, link: Link, channel: RTCDataChannel) {
    if (this.links.get(remote) !== link || link.profileChannel || !channel.ordered) {
      channel.close();
      return;
    }
    link.profileChannel = channel;
    link.stopProfile = bindProfileChannel(this.engine, remote, channel);
  }
  private bindWakeChannel(remote: string, link: Link, channel: RTCDataChannel) {
    if (this.links.get(remote) !== link || link.wakeChannel || !channel.ordered) {
      channel.close();
      return;
    }
    link.wakeChannel = channel;
    channel.addEventListener('open', () => {
      void this.wake
        ?.exchange(remote, (packet) => {
          if (channel.readyState !== 'open' || this.links.get(remote) !== link) return false;
          try {
            channel.send(JSON.stringify(packet));
            return true;
          } catch {
            return false;
          }
        })
        .catch(() => undefined);
    });
    channel.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || event.data.length > 256) {
        channel.close();
        return;
      }
      void (async () => {
        if (!(await this.engine.acceptsPeer(remote))) return;
        const packet = wakeGrantPacket.safeParse(JSON.parse(event.data));
        if (packet.success) await this.wake?.receive(remote, packet.data.capability);
      })().catch(() => channel.close());
    });
  }
  private bindChannel(remote: string, link: Link, channel: RTCDataChannel) {
    if (
      this.links.get(remote) !== link ||
      link.channel ||
      channel.label !== 'mnelo-v1' ||
      !channel.ordered
    ) {
      channel.close();
      return;
    }
    link.channel = channel;
    channel.addEventListener('open', () => {
      clearTimeout(link.deadline);
      this.changed();
      void this.engine.flush(remote).catch(() => undefined);
    });
    channel.addEventListener('close', () => {
      if (this.links.get(remote) === link) this.remove(remote);
    });
    channel.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || event.data.length > 24_000) {
        this.remove(remote);
        return;
      }
      const text = event.data;
      if (this.links.get(remote) !== link) return;
      // Bound queued JS strings while local storage/media work is still pending.
      link.queuedBytes += text.length * 2;
      if (link.queuedBytes > 2_000_000) {
        this.remove(remote);
        return;
      }
      link.receiveTail = link.receiveTail
        .then(async () => {
          if (this.links.get(remote) === link) await this.receivePacket(remote, link, text);
        })
        .catch(() => {
          if (this.links.get(remote) === link) this.remove(remote);
        })
        .finally(() => {
          link.queuedBytes -= text.length * 2;
        });
    });
  }
  private async receivePacket(remote: string, link: Link, text: string) {
    if (!(await this.engine.acceptsPeer(remote))) {
      this.remove(remote);
      return;
    }
    let input: unknown = JSON.parse(text);
    const chunk = chunkSchema.safeParse(input);
    if (chunk.success) {
      const value = chunk.data;
      if (link.incoming && link.incoming.expires < Date.now()) link.incoming = null;
      if (!link.incoming) {
        if (value.index !== 0) throw new Error('CHUNK_INVALID');
        link.incoming = {
          id: value.id,
          next: 0,
          total: value.total,
          parts: [],
          length: 0,
          expires: Date.now() + 60_000,
        };
      }
      const assembly = link.incoming;
      if (
        value.id !== assembly.id ||
        value.index !== assembly.next ||
        value.total !== assembly.total
      )
        throw new Error('CHUNK_INVALID');
      assembly.parts.push(value.text);
      assembly.length += value.text.length;
      assembly.next++;
      if (assembly.length > 15_000_000) throw new Error('CHUNK_LIMIT');
      if (assembly.next < assembly.total) return;
      input = JSON.parse(assembly.parts.join(''));
      link.incoming = null;
    }
    const packet = packetSchema.safeParse(input);
    if (!packet.success) throw new Error('PACKET_INVALID');
    if (packet.data.type === 'call') await this.calls?.receive(remote, packet.data);
    else {
      if (packet.data.type === 'ack')
        await this.calls?.receiveRingingReceipt(remote, packet.data.id);
      await this.engine.receive(remote, packet.data);
    }
  }
  send(remote: string, packet: Packet): boolean {
    if (packet.type === 'message' || packet.type === 'group')
      void this.wake?.wake(remote, { kind: 'message', id: packet.id }).catch(() => undefined);
    const link = this.links.get(remote);
    const channel = link?.channel;
    if (
      !link ||
      !channel ||
      channel.readyState !== 'open' ||
      link.outgoing ||
      channel.bufferedAmount > 128_000
    ) {
      if (packet.type === 'message' || packet.type === 'group')
        void this.wake?.wake(remote, { kind: 'message', id: packet.id }).catch(() => undefined);
      return false;
    }
    const text = JSON.stringify(packetSchema.parse(packet));
    if (text.length <= 12_000) {
      try {
        channel.send(text);
        return true;
      } catch {
        this.remove(remote);
        return false;
      }
    }
    if (text.length > 15_000_000) return false;
    link.outgoing = true;
    let index = 0;
    const total = Math.ceil(text.length / 12_000);
    const id = this.uuid();
    const pump = () => {
      link.pump = null;
      if (this.links.get(remote) !== link || channel.readyState !== 'open') {
        link.outgoing = false;
        return;
      }
      try {
        while (index < total && channel.bufferedAmount < 128_000) {
          channel.send(
            JSON.stringify({
              type: 'chunk',
              id,
              index,
              total,
              text: text.slice(index * 12_000, (index + 1) * 12_000),
            }),
          );
          index++;
        }
        if (index < total) link.pump = setTimeout(pump, 50);
        else link.outgoing = false;
      } catch {
        this.remove(remote);
      }
    };
    pump();
    return true;
  }
  private remove(peer: string) {
    this.pendingLinks.delete(peer);
    const link = this.links.get(peer);
    if (!link) return;
    this.links.delete(peer);
    clearTimeout(link.deadline);
    if (link.pump) clearTimeout(link.pump);
    link.incoming = null;
    link.stopProfile?.();
    link.channel?.close();
    link.peer.close();
    this.changed();
  }
  private async createMedia(remote: string, id: string, stream: MediaStream, preparing = false) {
    if (this.mediaLinks.has(remote) || this.pendingMedia.has(remote) || this.stopped)
      throw new Error('CALL_BUSY');
    this.pendingMedia.set(remote, id);
    this.calls?.stage('MEDIA_CONFIGURATION');
    let peer: RTCPeerConnection;
    try {
      const configuration = await this.configuration();
      const accepted = await this.engine.acceptsPeer(remote);
      const call = this.calls?.snapshot();
      if (
        this.stopped ||
        !accepted ||
        this.pendingMedia.get(remote) !== id ||
        call?.id !== id ||
        !(
          this.calls?.mediaAllowed(remote, id) ||
          (preparing &&
            !call.group &&
            !call.incoming &&
            call.peer === remote &&
            call.status === 'ringing' &&
            call.local === stream)
        )
      )
        throw new Error('CALL_CANCELLED');
      peer = this.factory(configuration);
    } finally {
      if (this.pendingMedia.get(remote) === id) this.pendingMedia.delete(remote);
    }
    const deadline = setTimeout(
      () => {
        void this.calls?.failed(remote, id);
      },
      preparing ? 65_000 : 30_000,
    );
    this.mediaLinks.set(remote, { peer, id, deadline });
    this.calls?.stage('MEDIA_TRACKS');
    const output = this.calls?.outputStream() ?? stream;
    for (const track of output.getTracks()) peer.addTrack(track, output);
    peer.addEventListener('datachannel', (event) =>
      this.attachMediaState(remote, id, event.channel),
    );
    peer.addEventListener('track', (event) => {
      if (this.mediaLinks.get(remote)?.peer !== peer) return;
      connectionTiming(event.track.kind === 'video' ? 'REMOTE_VIDEO_TRACK' : 'REMOTE_AUDIO_TRACK');
      const stream = event.streams[0];
      if (stream) this.calls?.remote(remote, id, stream);
    });
    peer.addEventListener('connectionstatechange', () => {
      if (this.mediaLinks.get(remote)?.peer !== peer) return;
      if (peer.connectionState === 'connected') {
        connectionTiming('MEDIA_TRANSPORT_CONNECTED');
        const link = this.mediaLinks.get(remote)!;
        link.stopStats ??= observeMediaTiming(peer, Boolean(stream.getVideoTracks().length));
        clearTimeout(link.deadline);
        this.calls?.connected(remote, id);
      } else if (peer.connectionState === 'failed') void this.calls?.failed(remote, id);
    });
    return peer;
  }
  // Fetch the short-lived TURN credentials while ringing, without opening a
  // microphone, camera or media peer on the recipient before they accept.
  async prepareCall() {
    await this.configuration();
  }
  private async publishMedia(
    remote: string,
    id: string,
    peer: RTCPeerConnection,
    type: Signal['type'],
  ) {
    this.calls?.stage('MEDIA_ICE_GATHERING');
    await gatherCallCandidates(peer);
    const initial = peer.localDescription?.sdp;
    await this.sendMediaDescription(remote, id, peer, type);
    const link = this.mediaLinks.get(remote);
    if (!link || link.peer !== peer || link.id !== id) return;
    let sent = initial;
    let sending = false;
    let cancelled = false;
    let batch: ReturnType<typeof setTimeout> | undefined;
    const flush = async () => {
      if (cancelled || sending) return;
      sending = true;
      try {
        while (!cancelled && peer.localDescription?.sdp !== sent) {
          const next = peer.localDescription?.sdp;
          await this.sendMediaDescription(remote, id, peer, type);
          sent = next;
        }
      } finally {
        sending = false;
      }
    };
    const update = () => {
      clearTimeout(batch);
      // A first relay candidate may not work on the current network. Publish
      // each newly gathered fallback promptly, even if another TURN transport
      // is still timing out. Waiting for 'complete' adds up to ten seconds.
      batch = setTimeout(() => void flush().catch(() => undefined), 150);
    };
    const timeout = setTimeout(() => {
      void flush()
        .catch(() => undefined)
        .finally(() => link.stopGathering?.());
    }, 10000);
    link.stopGathering = () => {
      cancelled = true;
      clearTimeout(timeout);
      clearTimeout(batch);
      peer.removeEventListener('icecandidate', update);
      peer.removeEventListener('icegatheringstatechange', update);
      delete link.stopGathering;
    };
    peer.addEventListener('icecandidate', update);
    peer.addEventListener('icegatheringstatechange', update);
    update();
    this.calls?.stage(type === 'offer' ? 'MEDIA_WAITING_ANSWER' : 'MEDIA_CONNECTING');
  }
  private async sendMediaDescription(
    remote: string,
    id: string,
    peer: RTCPeerConnection,
    type: Signal['type'],
  ) {
    if (this.mediaLinks.get(remote)?.id !== id || !peer.localDescription?.sdp) return;
    const envelope = signSignal(this.own.secret, {
      protocol: 'mnelo-dtls-v1',
      from: this.own.key,
      to: remote,
      session: id,
      purpose: 'call',
      expires: Date.now() + 120_000,
      type,
      sdp: peer.localDescription.sdp,
    });
    if (this.callSignaling) await this.callSignaling(remote, envelope);
    else this.sendSignal({ type: 'signal', to: remote, envelope });
  }
  async startMedia(remote: string, id: string, stream: MediaStream) {
    const prepared = this.preparedMedia.get(remote);
    const peer =
      prepared?.id === id ? await prepared.ready : await this.createOffer(remote, id, stream);
    if (this.mediaLinks.get(remote)?.peer !== peer || !this.calls?.mediaAllowed(remote, id)) return;
    this.preparedMedia.delete(remote);
    const link = this.mediaLinks.get(remote)!;
    clearTimeout(link.deadline);
    link.deadline = setTimeout(() => void this.calls?.failed(remote, id), 30_000);
    this.publishMediaInBackground(remote, id, peer, 'offer');
  }
  async prepareOutgoingMedia(remote: string, id: string, stream: MediaStream) {
    if (
      this.preparedMedia.has(remote) ||
      this.mediaLinks.has(remote) ||
      this.pendingMedia.has(remote)
    )
      return;
    const prepared = { id, ready: this.createOffer(remote, id, stream, true) };
    this.preparedMedia.set(remote, prepared);
    try {
      await prepared.ready;
    } catch (error) {
      if (this.preparedMedia.get(remote) === prepared) this.preparedMedia.delete(remote);
      this.endMedia(remote, id);
      throw error;
    }
  }
  private async createOffer(remote: string, id: string, stream: MediaStream, preparing = false) {
    const peer = await this.createMedia(remote, id, stream, preparing);
    this.attachMediaState(
      remote,
      id,
      peer.createDataChannel('mnelo-call-state-v1', { ordered: true }),
    );
    this.calls?.stage('MEDIA_CREATE_OFFER');
    await peer.setLocalDescription(await peer.createOffer());
    return peer;
  }
  async receiveCallSignal(sender: string, envelope: unknown) {
    const signal = readSignal(envelope, this.own.key);
    if (
      !signal ||
      signal.from !== sender ||
      signal.purpose !== 'call' ||
      !(await this.engine.acceptsPeer(sender))
    )
      throw new Error('CALL_SIGNAL_INVALID');
    await this.mediaSignal(signal);
  }
  private publishMediaInBackground(
    remote: string,
    id: string,
    peer: RTCPeerConnection,
    type: Signal['type'],
  ) {
    // TURN gathering may wait for an unreachable transport. It must not hold
    // the serial Signal inbox open and block receipts, hangup or fallback SDP.
    void this.publishMedia(remote, id, peer, type).catch(() => {
      if (this.mediaLinks.get(remote)?.peer === peer)
        void this.calls?.failed(remote, id).catch(() => undefined);
    });
  }
  private async mediaSignal(signal: Signal) {
    const existing = this.mediaLinks.get(signal.from);
    if (existing?.id === signal.session && existing.peer.remoteDescription?.type === signal.type) {
      await addCallCandidates(existing.peer, signal.sdp);
      return;
    }
    if (signal.type === 'offer') {
      const stream = this.calls?.allowedOffer(signal.from, signal.session);
      if (!stream || this.mediaLinks.has(signal.from) || this.pendingMedia.has(signal.from)) return;
      try {
        const peer = await this.createMedia(signal.from, signal.session, stream);
        this.calls?.stage('MEDIA_SET_OFFER');
        await peer.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        this.calls?.stage('MEDIA_CREATE_ANSWER');
        await peer.setLocalDescription(await peer.createAnswer());
        this.publishMediaInBackground(signal.from, signal.session, peer, 'answer');
      } catch {
        await this.calls?.failed(signal.from, signal.session);
      }
    } else {
      const link = this.mediaLinks.get(signal.from);
      if (
        !link ||
        link.id !== signal.session ||
        !this.calls?.allowedAnswer(signal.from, signal.session) ||
        link.peer.signalingState !== 'have-local-offer'
      )
        return;
      try {
        this.calls?.stage('MEDIA_SET_ANSWER');
        await link.peer.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        this.calls?.stage('MEDIA_CONNECTING');
      } catch {
        await this.calls?.failed(signal.from, signal.session);
      }
    }
  }
  private attachMediaState(remote: string, id: string, channel: RTCDataChannel) {
    const link = this.mediaLinks.get(remote);
    if (!link || link.id !== id || channel.label !== 'mnelo-call-state-v1' || link.state) {
      channel.close();
      return;
    }
    link.state = channel;
    channel.addEventListener('open', () => this.publishMediaState(id));
    channel.addEventListener('message', (event) => {
      if (
        this.mediaLinks.get(remote) !== link ||
        typeof event.data !== 'string' ||
        event.data.length > 256
      )
        return;
      try {
        const state = z
          .object({
            v: z.literal(1),
            sharing: z.boolean(),
            camera: z.boolean(),
            muted: z.boolean(),
          })
          .strict()
          .parse(JSON.parse(event.data));
        this.calls?.remoteMediaState(remote, id, state);
      } catch {
        /* Only bounded media state is accepted on this authenticated call channel. */
      }
    });
  }
  publishMediaState(id: string) {
    const state = JSON.stringify(this.calls?.localMediaState());
    for (const link of this.mediaLinks.values())
      if (link.id === id && link.state?.readyState === 'open') {
        try {
          link.state.send(state);
        } catch {
          /* Media continues while the control channel closes. */
        }
      }
  }
  replaceVideo(id: string, track: MediaStreamTrack | null) {
    const next = this.videoReplacement
      .catch(() => undefined)
      .then(async () => {
        const results = await Promise.allSettled(
          [...this.mediaLinks.entries()]
            .filter(([, link]) => link.id === id)
            .map(async ([remote, link]) => {
              const sender = link.peer
                .getSenders()
                .find((sender) => sender.track?.kind === 'video');
              try {
                if (sender) await sender.replaceTrack(track);
              } catch (error) {
                if (this.mediaLinks.get(remote) === link) throw error;
              }
            }),
        );
        // Wait for every peer before a queued rollback can restore the camera.
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      });
    this.videoReplacement = next;
    return next;
  }
  endMedia(remote: string, id: string) {
    if (this.preparedMedia.get(remote)?.id === id) this.preparedMedia.delete(remote);
    if (this.pendingMedia.get(remote) === id) this.pendingMedia.delete(remote);
    const link = this.mediaLinks.get(remote);
    if (!link || link.id !== id) return;
    this.mediaLinks.delete(remote);
    clearTimeout(link.deadline);
    link.stopGathering?.();
    link.stopStats?.();
    link.peer.close();
  }
  stop() {
    this.stopped = true;
    this.pendingLinks.clear();
    this.pendingMedia.clear();
    this.preparedMedia.clear();
    this.ready = false;
    if (this.retry) clearTimeout(this.retry);
    if (this.poll) clearInterval(this.poll);
    this.retry = null;
    this.poll = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    for (const peer of [...this.links.keys()]) this.remove(peer);
    for (const [peer, link] of this.mediaLinks) this.endMedia(peer, link.id);
    this.calls?.stop();
    this.calls = null;
  }
}
