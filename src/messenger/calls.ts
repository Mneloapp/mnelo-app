import { connectionTiming } from './connection-timing';
import type { Packet } from './model';
import { groupCallSchema, sameGroupCall, acceptsGroupCall, type GroupCall } from './group-call';
import type { DeviceMessenger } from './engine';
import type { PeerMesh } from './peer-mesh';
import {
  captureCall,
  stopCallAudio,
  speakerOutput,
  switchCallCamera,
  callOutputStream,
} from './call-platform';
import { directChatId } from './crypto';
import { callOutcome } from './call-record';
import { captureScreen } from './capture-screen';
import type { ScreenCapture } from './screen-capture';
export type CallMediaState = { sharing: boolean; muted: boolean; camera: boolean };

export type CallControl = Extract<Packet, { type: 'call' }>;
export type CallSignaling = {
  send(peer: string, control: CallControl): Promise<void>;
  ringingReceipt?(peer: string, id: string): Promise<void>;
  flushTerminal?(peer: string, control: CallControl): Promise<void>;
};
export type CallParticipant = {
  ringingConfirmed?: boolean;
  peer: string;
  status: 'ringing' | 'connecting' | 'active' | 'left' | 'declined' | 'failed';
  remote: MediaStream | null;
  muted: boolean;
  camera: boolean;
  sharing: boolean;
};
export type DeviceCall = {
  ringingConfirmed?: boolean;
  connectedAt?: number;
  endedAt?: number;
  screen?: MediaStream | null;
  screenStarting?: boolean;
  remoteState?: CallMediaState;
  group?: GroupCall;
  participants?: CallParticipant[];
  diagnostic?: string;
  id: string;
  peer: string;
  chat: string;
  media: 'voice' | 'video';
  incoming: boolean;
  status: 'incoming' | 'ringing' | 'connecting' | 'active' | 'ended' | 'failed';
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  speaker: boolean;
  camera: boolean;
};
export class DeviceCalls {
  private value: DeviceCall | null = null;
  private replying = new Set<string>();
  private listeners = new Set<() => void>();
  private controls = new Set<(value: CallControl) => void>();
  private incomingReceipt: { id: string; promise: Promise<void> } | null = null;
  private terminal = new Map<
    string,
    {
      owner: string;
      call: DeviceCall;
      failed: boolean;
      reason: 'local' | 'remote' | 'decline' | 'timeout';
      notify: boolean;
      requireDurable: boolean;
      notified: boolean;
      recorded: boolean;
      expires: number;
      work?: Promise<void>;
    }
  >();
  get owner() {
    return this.engine.currentIdentity()?.key ?? null;
  }
  // Native end actions can arrive before JS has loaded the authenticated invite.
  // A terminal screen is not evidence that its decline was durably persisted.
  async endFromSystem(
    id: string,
    reason: 'local' | 'remote' | 'decline' | 'timeout',
    failed = false,
  ): Promise<boolean> {
    if (this.value?.id === id && this.active()) await this.end(failed, true, reason, true);
    const pending = this.terminal.get(id);
    if (!pending || pending.owner !== this.owner || pending.expires < Date.now()) return false;
    await this.finishTerminal(id);
    if (pending.owner !== this.owner || this.terminal.get(id) !== pending) return false;
    if (pending.notify && this.signaling?.flushTerminal) {
      const call = pending.call;
      const control: CallControl = {
        type: 'call',
        id: call.id,
        media: call.media,
        action: call.status === 'incoming' ? 'decline' : 'end',
        ...(call.group ? { group: call.group } : {}),
      };
      await Promise.all(
        (call.group ? call.participants!.map((person) => person.peer) : [call.peer]).map((peer) =>
          this.signaling!.flushTerminal!(peer, control),
        ),
      );
    }
    return pending.owner === this.owner && this.terminal.get(id) === pending;
  }
  private finishTerminal(id: string): Promise<void> {
    const pending = this.terminal.get(id);
    if (!pending || pending.owner !== this.owner)
      return Promise.reject(new Error('CALL_UNAVAILABLE'));
    if (pending.work) return pending.work;
    const { call } = pending;
    const assertCurrent = () => {
      if (pending.owner !== this.owner || this.terminal.get(id) !== pending)
        throw new Error('CALL_UNAVAILABLE');
    };
    const notify = async () => {
      if (!pending.notified && pending.notify) {
        const control: CallControl = {
          type: 'call',
          id: call.id,
          media: call.media,
          action: call.status === 'incoming' ? 'decline' : 'end',
          ...(call.group ? { group: call.group } : {}),
        };
        if (call.group)
          await Promise.all(call.participants!.map((person) => this.send(person.peer, control)));
        else if (this.signaling) await this.send(call.peer, control);
        else if (!this.mesh.send(call.peer, control)) {
          await this.mesh.waitForPeer(call.peer, () => this.owner === pending.owner, 15000);
          if (this.owner !== pending.owner || !this.mesh.send(call.peer, control))
            throw new Error('CALL_UNAVAILABLE');
        }
        assertCurrent();
        pending.notified = true;
      }
    };
    const record = async () => {
      assertCurrent();
      if (!pending.recorded) {
        await this.engine.recordCall(
          call.chat,
          call.id,
          call.peer,
          call.media,
          callOutcome(call, pending.failed, pending.reason),
          call.incoming ? 'incoming' : 'outgoing',
        );
        pending.recorded = true;
      }
    };
    const work = (async () => {
      // A native decline keeps its saved incoming invite recoverable until the
      // terminal control is durable. Ordinary call history remains immediate.
      if (pending.requireDurable) {
        await notify();
        await record();
      } else {
        const results = await Promise.allSettled([notify(), record()]);
        for (const result of results) if (result.status === 'rejected') throw result.reason;
      }
    })();
    pending.work = work;
    void work
      .finally(() => {
        if (pending.work === work) delete pending.work;
      })
      .catch(() => undefined);
    return work;
  }
  // Called only after the incoming UI was presented (CallKit/Telecom success
  // event, or the focused foreground call screen without a native provider).
  confirmIncoming(id: string): Promise<void> {
    const call = this.value;
    if (!call?.incoming || call.id !== id || call.status !== 'incoming') return Promise.resolve();
    if (this.incomingReceipt?.id === id) return this.incomingReceipt.promise;
    const promise = (async () => {
      // Reuse the existing authenticated ACK packet with the call UUID. Older
      // clients safely ignore an ACK with no message delivery; invites stay compatible.
      if (this.signaling) await this.signaling.ringingReceipt?.(call.peer, id);
      else if (!this.mesh.send(call.peer, { type: 'ack', id })) throw new Error('CALL_UNAVAILABLE');
    })();
    this.incomingReceipt = { id, promise };
    void promise.catch(() => {
      if (this.incomingReceipt?.promise === promise) this.incomingReceipt = null;
    });
    return promise;
  }
  async receiveRingingReceipt(peer: string, id: string) {
    if (!(await this.engine.acceptsPeer(peer))) return;
    const call = this.value;
    if (!call || call.id !== id || call.incoming || call.status !== 'ringing') return;
    if (call.group) {
      if (!(await this.acceptsGroup(call.group)) || this.value !== call) return;
      const person = call.participants?.find((value) => value.peer === peer);
      if (!person || person.status !== 'ringing' || person.ringingConfirmed) return;
      this.update({
        ...call,
        participants: call.participants!.map((value) =>
          value.peer === peer ? { ...value, ringingConfirmed: true } : value,
        ),
      });
    } else if (call.peer === peer && !call.ringingConfirmed) {
      this.update({ ...call, ringingConfirmed: true });
    }
  }
  observeControl(listener: (value: CallControl) => void) {
    this.controls.add(listener);
    return () => {
      this.controls.delete(listener);
    };
  }
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly mesh: PeerMesh,
    private readonly uuid: () => string,
    private readonly signaling?: CallSignaling,
  ) {
    mesh.calls = this;
  }
  private async send(peer: string, control: CallControl) {
    if (this.signaling) return this.signaling.send(peer, control);
    if (!this.mesh.send(peer, control)) throw new Error('CALL_UNAVAILABLE');
  }
  get supportsQueuedSignaling() {
    return Boolean(this.signaling);
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: DeviceCall | null) {
    if (next?.status === 'active' && !next.connectedAt)
      next = {
        ...next,
        connectedAt:
          this.value?.id === next.id ? (this.value.connectedAt ?? Date.now()) : Date.now(),
      };
    if (next && ['ended', 'failed'].includes(next.status) && !next.endedAt)
      next = { ...next, endedAt: Date.now() };
    this.value = next;
    this.listeners.forEach((listener) => listener());
  }
  stage(code: string) {
    // Only caller-supplied constant codes, never peer IDs, SDP, messages or native error text.
    if (!/^[A-Z_]{1,48}$/.test(code) || !this.value) return;
    connectionTiming(code);
    this.update({ ...this.value, diagnostic: code });
  }
  private active() {
    return this.value && !['ended', 'failed'].includes(this.value.status);
  }
  private expire(delay = 60_000) {
    if (this.timer) clearTimeout(this.timer);
    const id = this.value?.id;
    this.timer = setTimeout(
      () => {
        if (this.value?.id === id) void this.end(true, true, 'timeout');
      },
      Math.min(60_000, Math.max(1, delay)),
    );
  }
  private screenCapture: ScreenCapture | null = null;
  private screenRequest: AbortController | null = null;
  private screenGeneration = 0;
  private stopCapturedScreen() {
    this.screenGeneration++;
    this.screenRequest?.abort();
    this.screenRequest = null;
    this.screenCapture?.stop();
    this.screenCapture = null;
  }
  localMediaState() {
    return {
      v: 1 as const,
      sharing: Boolean(this.value?.screen),
      camera: Boolean(this.value?.camera),
      muted: Boolean(this.value?.muted),
    };
  }
  remoteMediaState(peer: string, id: string, state: CallMediaState) {
    const call = this.value;
    if (!call || call.id !== id || !this.active()) return;
    if (call.group)
      this.update({
        ...call,
        participants: call.participants!.map((value) =>
          value.peer === peer && ['connecting', 'active'].includes(value.status)
            ? { ...value, ...state }
            : value,
        ),
      });
    else if (call.peer === peer) this.update({ ...call, remoteState: state });
  }
  outputStream() {
    const call = this.value;
    if (!call?.local) return null;
    if (!call.screen) return call.local;
    return callOutputStream(call.local, call.screen);
  }
  async shareScreen() {
    const call = this.value;
    if (!call || call.media !== 'video' || call.status !== 'active' || !call.local) return;
    if (call.screen || call.screenStarting) {
      await this.stopScreenShare();
      return;
    }
    const generation = ++this.screenGeneration;
    const request = new AbortController();
    this.screenRequest = request;
    this.update({ ...call, screenStarting: true });
    try {
      const capture = await captureScreen(call.id, request.signal);
      if (generation !== this.screenGeneration || this.value?.id !== call.id || !this.active()) {
        capture.stop();
        return;
      }
      this.screenCapture = capture;
      const track = capture.stream.getVideoTracks()[0]!;
      track.addEventListener(
        'ended',
        () => {
          if (this.screenCapture === capture) void this.stopScreenShare().catch(() => undefined);
        },
        { once: true },
      );
      this.update({ ...this.value, screen: capture.stream });
      await this.mesh.replaceVideo(call.id, track);
      if (generation !== this.screenGeneration || this.value?.id !== call.id || !this.active()) {
        capture.stop();
        return;
      }
      call.local.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
      this.update({ ...this.value, screen: capture.stream, screenStarting: false });
      this.mesh.publishMediaState(call.id);
    } catch (error) {
      if (generation !== this.screenGeneration || this.value?.id !== call.id || !this.active())
        return;
      this.stopCapturedScreen();
      if (this.value?.id === call.id)
        this.update({ ...this.value, screen: null, screenStarting: false });
      await this.restoreCamera(call);
      if (!(error instanceof Error && error.message === 'SCREEN_SHARE_CANCELLED')) throw error;
    }
  }
  async stopScreenShare() {
    const call = this.value;
    this.stopCapturedScreen();
    if (!call?.local || !this.active()) return;
    call.local.getVideoTracks().forEach((track) => {
      track.enabled = call.camera;
    });
    this.update({ ...call, screen: null, screenStarting: false });
    await this.restoreCamera(call);
  }
  private async restoreCamera(call: DeviceCall) {
    if (!call.local || this.value?.id !== call.id || !this.active()) return;
    try {
      await this.mesh.replaceVideo(call.id, call.local.getVideoTracks()[0] ?? null);
    } catch (error) {
      // A failed rollback must not leave a frozen screen advertised as a working camera.
      if (this.value?.id === call.id) await this.end(true);
      throw error;
    }
    if (this.value?.id === call.id) this.mesh.publishMediaState(call.id);
  }
  private groupReady = new Set<string>();
  private groupOffers = new Set<string>();
  private groupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private clearGroupTimers() {
    this.groupTimers.forEach(clearTimeout);
    this.groupTimers.clear();
  }
  private acceptsGroup(group: GroupCall) {
    return acceptsGroupCall(this.engine, group);
  }
  async enforceMembership() {
    const call = this.value;
    if (
      call?.group &&
      this.active() &&
      !(await this.acceptsGroup(call.group)) &&
      this.value?.id === call.id
    )
      await this.end(true);
  }
  private groupParticipants(group: GroupCall): CallParticipant[] {
    const own = this.engine.currentIdentity()!.key;
    return group.participants
      .filter((peer) => peer !== own)
      .map((peer) => ({
        peer,
        status: 'ringing',
        remote: null,
        muted: false,
        camera: true,
        sharing: false,
      }));
  }
  async startGroup(chat: string, peers: string[], media: 'voice' | 'video') {
    const own = this.engine.currentIdentity();
    if (!own) throw new Error('IDENTITY_REQUIRED');
    const group = groupCallSchema.parse({
      chat,
      host: own.key,
      participants: [...new Set([own.key, ...peers])].sort(),
    });
    if (this.active() || !(await this.acceptsGroup(group))) throw new Error('CALL_UNAVAILABLE');
    if (this.active()) throw new Error('CALL_UNAVAILABLE');
    const id = this.uuid();
    this.groupReady.clear();
    this.groupOffers.clear();
    this.clearGroupTimers();
    this.update({
      id,
      peer: own.key,
      chat,
      group,
      participants: this.groupParticipants(group),
      media,
      incoming: false,
      status: 'ringing',
      local: null,
      remote: null,
      muted: false,
      speaker: true,
      camera: media === 'video',
    });
    this.expire();
    try {
      const stream = await captureCall(media === 'video', true);
      if (this.value?.id !== id || !this.active()) {
        stream.getTracks().forEach((track) => track.stop());
        if (!this.active()) await stopCallAudio();
        return;
      }
      this.update({ ...this.value, local: stream });
      await Promise.all(
        this.value.participants!.map(async (participant) => {
          try {
            await this.send(participant.peer, { type: 'call', id, media, action: 'invite', group });
            this.armGroupParticipant(participant.peer, id);
          } catch {
            await this.leaveParticipant(participant.peer, id, 'failed');
          }
        }),
      );
    } catch (error) {
      if (this.value?.id === id) await this.end(true);
      throw error;
    }
  }
  private armGroupParticipant(peer: string, id: string) {
    if (
      this.groupTimers.has(peer) ||
      !this.active() ||
      this.value?.id !== id ||
      this.value.participants?.find((value) => value.peer === peer)?.status === 'active'
    )
      return;
    this.groupTimers.set(
      peer,
      setTimeout(() => {
        this.groupTimers.delete(peer);
        void this.leaveParticipant(peer, id, 'failed');
      }, 60000),
    );
  }
  private async receiveGroup(
    peer: string,
    control: CallControl & { group: GroupCall },
    ringWindow?: number,
  ) {
    const { group } = control;
    if (!group.participants.includes(peer) || !(await this.acceptsGroup(group))) return;
    let call = this.value;
    if (control.action === 'invite') {
      if (peer !== group.host) return;
      if (call?.id === control.id) return;
      if (this.active()) {
        await this.send(peer, { ...control, action: 'decline' }).catch(() => undefined);
        await this.engine.recordCall(
          group.chat,
          control.id,
          peer,
          control.media,
          'missed',
          'incoming',
        );
        return;
      }
      this.groupReady.clear();
      this.groupOffers.clear();
      this.clearGroupTimers();
      this.update({
        id: control.id,
        peer,
        chat: group.chat,
        group,
        participants: this.groupParticipants(group),
        media: control.media,
        incoming: true,
        status: 'incoming',
        local: null,
        remote: null,
        muted: false,
        speaker: true,
        camera: control.media === 'video',
      });
      this.expire(ringWindow);
      return;
    }
    if (
      !call?.group ||
      call.id !== control.id ||
      call.media !== control.media ||
      !sameGroupCall(call.group, group) ||
      !this.active()
    )
      return;
    const participant = call.participants?.find((value) => value.peer === peer);
    if (!participant || ['left', 'declined', 'failed'].includes(participant.status)) return;
    if (control.action === 'end' || control.action === 'decline') {
      if (call.status === 'incoming' && peer === group.host) {
        await this.end(false, false, 'remote');
        return;
      }
      await this.leaveParticipant(
        peer,
        call.id,
        control.action === 'decline' ? 'declined' : 'left',
      );
      return;
    }
    if (control.action !== 'accept') return;
    const first = !this.groupReady.has(peer);
    this.groupReady.add(peer);
    if (!call.local || call.status === 'incoming') return;
    if (first) {
      // Answer readiness once, including an accept that arrived before our invite.
      await this.send(peer, { ...control, action: 'accept' }).catch(() => undefined);
    }
    call = this.value;
    if (call?.id === control.id && this.active()) await this.connectParticipant(peer, call.id);
  }
  private async acceptGroup(call: DeviceCall & { group: GroupCall }) {
    this.update({ ...call, status: 'connecting' });
    this.stage('ANSWER_ACCEPTED');
    try {
      if (!(await this.acceptsGroup(call.group))) throw new Error('CALL_UNAVAILABLE');
      if (this.value?.id !== call.id || !this.active()) return;
      const stream = await captureCall(call.media === 'video', true);
      if (this.value?.id !== call.id || !this.active()) {
        stream.getTracks().forEach((track) => track.stop());
        if (!this.active()) await stopCallAudio();
        return;
      }
      this.update({ ...this.value, local: stream });
      await Promise.all(
        this.value
          .participants!.filter((value) => !['left', 'declined', 'failed'].includes(value.status))
          .map(async (participant) => {
            this.armGroupParticipant(participant.peer, call.id);
            await this.send(participant.peer, {
              type: 'call',
              id: call.id,
              media: call.media,
              action: 'accept',
              group: call.group,
            }).catch(() => undefined);
            if (this.groupReady.has(participant.peer))
              await this.connectParticipant(participant.peer, call.id);
          }),
      );
    } catch {
      if (this.value?.id === call.id) await this.end(true);
    }
  }
  private async connectParticipant(peer: string, id: string) {
    const call = this.value;
    if (
      !call?.group ||
      call.id !== id ||
      !call.local ||
      !this.active() ||
      !this.groupReady.has(peer)
    )
      return;
    const participant = call.participants?.find((value) => value.peer === peer);
    if (!participant || ['active', 'left', 'declined', 'failed'].includes(participant.status))
      return;
    this.update({
      ...call,
      status: call.status === 'active' ? 'active' : 'connecting',
      participants: call.participants!.map((value) =>
        value.peer === peer ? { ...value, status: 'connecting' } : value,
      ),
    });
    const own = this.engine.currentIdentity()!.key;
    if (own > peer || this.groupOffers.has(peer)) return;
    this.groupOffers.add(peer);
    try {
      await this.mesh.startMedia(peer, id, this.outputStream() ?? call.local);
    } catch {
      await this.leaveParticipant(peer, id, 'failed');
    }
  }
  private async leaveParticipant(peer: string, id: string, status: 'left' | 'declined' | 'failed') {
    const call = this.value;
    if (!call?.group || call.id !== id || !this.active()) return;
    clearTimeout(this.groupTimers.get(peer));
    this.groupTimers.delete(peer);
    this.groupReady.delete(peer);
    this.mesh.endMedia(peer, id);
    const participants = call.participants!.map((value) =>
      value.peer === peer ? { ...value, status, remote: null } : value,
    );
    this.update({ ...call, participants });
    if (participants.every((value) => ['left', 'declined', 'failed'].includes(value.status)))
      await this.end(status === 'failed', false, 'remote');
  }
  mediaAllowed(peer: string, id: string) {
    const call = this.value;
    if (!call || call.id !== id || !this.active()) return false;
    if (!call.group) return call.peer === peer && call.status === 'connecting';
    return Boolean(
      call.local &&
      call.status !== 'incoming' &&
      call.participants?.some(
        (value) => value.peer === peer && ['ringing', 'connecting'].includes(value.status),
      ) &&
      this.groupReady.has(peer),
    );
  }
  async start(peer: string, media: 'voice' | 'video') {
    if (!(await this.engine.acceptsPeer(peer)) || this.active())
      throw new Error('CALL_UNAVAILABLE');
    const own = this.engine.currentIdentity();
    if (!own) throw new Error('IDENTITY_REQUIRED');
    const id = this.uuid();
    this.update({
      id,
      peer,
      chat: directChatId(own.key, peer),
      media,
      incoming: false,
      status: 'ringing',
      local: null,
      remote: null,
      muted: false,
      speaker: media === 'video',
      camera: media === 'video',
    });
    this.expire();
    try {
      void this.mesh.prepareCall?.().catch(() => undefined);
      this.stage('CAPTURE_OUTGOING');
      const stream = await captureCall(media === 'video');
      if (this.value?.id !== id || !this.active()) {
        stream.getTracks().forEach((track) => track.stop());
        if (!this.active()) await stopCallAudio();
        return;
      }
      this.update({ ...this.value, local: stream });
      this.stage('WAITING_FOR_ACCEPT');
      if (!this.signaling && !this.mesh.online(peer)) {
        if (!this.mesh.wake) throw new Error('CALL_UNAVAILABLE');
        await this.mesh.wake.wake(peer, { kind: 'call', id, video: media === 'video' });
        await this.mesh.waitForPeer(peer, () => this.value?.id === id && Boolean(this.active()));
      } else if (!this.signaling)
        void this.mesh.wake
          ?.wake(peer, { kind: 'call', id, video: media === 'video' })
          .catch(() => undefined);
      if (this.value?.id !== id || !this.active()) return;
      // Gather the caller's already-authorized media while the invite is being
      // persisted/delivered. A quick answer must not wait for a second cold
      // setup after that network round trip. Once the invite is persisted, the
      // recipient can cache the offer without opening media before answering.
      if (this.signaling)
        void this.mesh.prepareOutgoingMedia?.(peer, id, stream).catch(() => undefined);
      await this.send(peer, { type: 'call', id, action: 'invite', media });
      if (this.value?.id === id && this.active()) {
        this.expire();
        if (this.signaling) void this.mesh.publishPreparedMedia?.(peer, id).catch(() => undefined);
      }
    } catch (error) {
      if (this.value?.id === id) await this.end(true);
      throw error;
    }
  }
  async receive(peer: string, control: CallControl, ringWindow?: number) {
    if (!(await this.engine.acceptsPeer(peer))) return;
    if (control.group)
      return this.receiveGroup(peer, { ...control, group: control.group }, ringWindow);
    if (control.action !== 'invite' && this.value?.group) return;
    if (control.action === 'invite') {
      // A retransmitted invite must not reject the call already ringing/active.
      if (this.value?.id === control.id && this.value.peer === peer) return;
      if (this.active()) {
        await this.send(peer, { ...control, action: 'decline' }).catch(() => undefined);
        const own = this.engine.currentIdentity();
        if (own)
          await this.engine.recordCall(
            directChatId(own.key, peer),
            control.id,
            peer,
            control.media,
            'missed',
            'incoming',
          );
        return;
      }
      const own = this.engine.currentIdentity();
      if (!own) return;
      this.update({
        id: control.id,
        peer,
        chat: directChatId(own.key, peer),
        media: control.media,
        incoming: true,
        status: 'incoming',
        local: null,
        remote: null,
        muted: false,
        speaker: control.media === 'video',
        camera: control.media === 'video',
      });
      this.expire(ringWindow);
      void this.mesh.prepareCall?.().catch(() => undefined);
      return;
    }
    const call = this.value;
    if (
      !call ||
      call.peer !== peer ||
      call.id !== control.id ||
      call.media !== control.media ||
      !this.active()
    )
      return;
    this.controls.forEach((listener) => listener(control));
    if (control.action === 'accept' && !call.incoming && call.status === 'ringing' && call.local) {
      this.update({ ...call, status: 'connecting' });
      this.stage('REMOTE_ACCEPT_RECEIVED');
      this.stage('MEDIA_OFFER');
      // The authenticated inbox must remain available for a remote hangup and
      // messages while TURN credentials or the native offer are still pending.
      // PeerMesh checks this call again before allocating/publishing its media.
      void this.mesh
        .startMedia(peer, call.id, call.local)
        .then(() => this.mesh.resumeCallMedia?.(peer, call.id))
        .catch(async () => {
          if (this.value?.id === call.id) await this.end(true);
        })
        .catch(() => undefined);
    } else if (control.action === 'end' || control.action === 'decline')
      await this.end(false, false, control.action === 'decline' ? 'decline' : 'remote');
  }
  async accept() {
    const call = this.value;
    if (!call || call.status !== 'incoming') return;
    if (call.group) return this.acceptGroup({ ...call, group: call.group });
    this.update({ ...call, status: 'connecting' });
    this.stage('ANSWER_ACCEPTED');
    // The user has answered. Persist acceptance while native capture starts,
    // instead of adding capture time to the signaling round trip. An offer
    // arriving in the meantime stays cached until local capture is ready.
    const accepted = this.send(call.peer, {
      type: 'call',
      id: call.id,
      action: 'accept',
      media: call.media,
    }).catch(async () => {
      if (this.value?.id === call.id && this.active()) await this.end(true).catch(() => undefined);
    });
    try {
      this.stage('CAPTURE_INCOMING');
      const stream = await captureCall(call.media === 'video');
      if (this.value?.id !== call.id || !this.active()) {
        stream.getTracks().forEach((track) => track.stop());
        if (!this.active()) await stopCallAudio();
        return;
      }
      this.update({ ...this.value, local: stream });
      this.stage('CAPTURE_INCOMING_READY');
      this.stage('WAITING_FOR_MEDIA_OFFER');
      await this.mesh.resumeCallMedia?.(call.peer, call.id);
      await accepted;
    } catch {
      if (this.value?.id === call.id) await this.end(true);
    }
  }
  allowedOffer(peer: string, id: string) {
    const call = this.value;
    if (call?.group)
      return this.mediaAllowed(peer, id) && peer < this.engine.currentIdentity()!.key
        ? this.outputStream()
        : null;
    return call?.peer === peer &&
      call.id === id &&
      call.incoming &&
      call.status === 'connecting' &&
      call.local
      ? call.local
      : null;
  }
  allowedAnswer(peer: string, id: string) {
    const call = this.value;
    if (call?.group)
      return this.mediaAllowed(peer, id) && peer > this.engine.currentIdentity()!.key;
    return call?.peer === peer && call.id === id && !call.incoming && call.status === 'connecting';
  }
  connected(peer: string, id: string) {
    const call = this.value;
    if (call?.group) {
      if (!this.mediaAllowed(peer, id)) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      clearTimeout(this.groupTimers.get(peer));
      this.groupTimers.delete(peer);
      this.update({
        ...call,
        status: 'active',
        diagnostic: 'CONNECTED',
        participants: call.participants!.map((value) =>
          value.peer === peer ? { ...value, status: 'active' } : value,
        ),
      });
      return;
    }
    if (call?.peer !== peer || call.id !== id || !this.active()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({ ...call, status: 'active', diagnostic: 'CONNECTED' });
  }
  remote(peer: string, id: string, stream: MediaStream) {
    const call = this.value;
    if (call?.group && call.id === id && this.active()) {
      this.update({
        ...call,
        participants: call.participants!.map((value) =>
          value.peer === peer && ['connecting', 'active'].includes(value.status)
            ? { ...value, remote: stream }
            : value,
        ),
      });
      return;
    }
    if (call?.peer === peer && call.id === id && this.active())
      this.update({ ...call, remote: stream });
  }
  async failed(peer: string, id: string) {
    if (this.value?.group) return this.leaveParticipant(peer, id, 'failed');
    if (this.value?.peer === peer && this.value.id === id && this.active()) await this.end(true);
  }
  async replyAndDecline(id: string, text: string) {
    const call = this.value;
    if (
      !call ||
      call.id !== id ||
      call.status !== 'incoming' ||
      this.replying.has(id) ||
      !text.trim() ||
      text.length > 240
    )
      throw new Error('CALL_UNAVAILABLE');
    const own = this.engine.currentIdentity();
    if (!own) throw new Error('CALL_UNAVAILABLE');
    this.replying.add(id);
    try {
      // Persist the reply before declining; a network outage must not lose it.
      const message = await this.engine.send(directChatId(own.key, call.peer), text.trim(), {
        deferDelivery: true,
      });
      if (this.value?.id === id && this.value.status === 'incoming')
        await this.end(false, true, 'decline');
      void this.engine.flush(undefined, message).catch(() => undefined);
    } finally {
      this.replying.delete(id);
    }
  }
  async end(
    failed = false,
    notify = true,
    reason: 'local' | 'remote' | 'decline' | 'timeout' = 'local',
    requireDurable = false,
  ) {
    const call = this.value;
    if (!call || !this.active()) return;
    connectionTiming(failed ? 'CALL_FAILED' : 'CALL_ENDED');
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      this.stopCapturedScreen();
    } catch {
      /* A closed capture must not prevent decline. */
    }
    for (const [id, pending] of this.terminal)
      if (pending.expires < Date.now()) this.terminal.delete(id);
    if (this.terminal.size >= 16) this.terminal.delete(this.terminal.keys().next().value!);
    this.terminal.set(call.id, {
      owner: this.owner ?? '',
      call: {
        ...call,
        local: null,
        remote: null,
        screen: null,
        ...(call.participants
          ? { participants: call.participants.map((person) => ({ ...person, remote: null })) }
          : {}),
      },
      failed,
      reason,
      notify,
      requireDurable,
      notified: !notify,
      recorded: false,
      expires: Date.now() + 120000,
    });
    this.update({
      ...call,
      status: failed ? 'failed' : 'ended',
      local: null,
      remote: null,
      screen: null,
      screenStarting: false,
      ...(call.participants
        ? { participants: call.participants.map((value) => ({ ...value, remote: null })) }
        : {}),
    });
    // Stop local capture/playback even if one native resource already closed.
    this.clearGroupTimers();
    for (const peer of call.group ? call.group.participants : [call.peer]) {
      try {
        this.mesh.endMedia(peer, call.id);
      } catch {
        /* Continue terminal signaling. */
      }
    }
    for (const track of call.local?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        /* Continue releasing remaining tracks. */
      }
    }
    const terminal = this.finishTerminal(call.id);
    await Promise.all([
      stopCallAudio().catch(() => undefined),
      requireDurable ? terminal : terminal.catch(() => undefined),
    ]);
  }

  mute() {
    const call = this.value;
    if (!call?.local) return;
    const muted = !call.muted;
    call.local.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.update({ ...call, muted });
    this.mesh.publishMediaState?.(call.id);
  }
  camera() {
    const call = this.value;
    if (!call?.local || call.media !== 'video' || call.screen || call.screenStarting) return;
    const camera = !call.camera;
    call.local.getVideoTracks().forEach((track) => {
      track.enabled = camera;
    });
    this.update({ ...call, camera });
    this.mesh.publishMediaState?.(call.id);
  }
  async speaker() {
    const call = this.value;
    if (!call) return;
    await speakerOutput(!call.speaker);
    if (this.value?.id === call.id) this.update({ ...this.value, speaker: !call.speaker });
  }
  audioRoute(id: string, speaker: boolean) {
    if (this.value?.id === id && this.active() && this.value.speaker !== speaker)
      this.update({ ...this.value, speaker });
  }
  async switchCamera() {
    const stream = this.value?.local;
    if (stream) await switchCallCamera(stream);
  }
  stop() {
    if (this.active()) connectionTiming('CALL_STOPPED');
    this.stopCapturedScreen();
    this.clearGroupTimers();
    this.groupReady.clear();
    this.groupOffers.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.value?.local?.getTracks().forEach((track) => track.stop());
    this.terminal.clear();
    this.update(null);
    void stopCallAudio().catch(() => undefined);
  }
}
