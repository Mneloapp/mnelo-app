import type { Packet } from './model';
import type { DeviceMessenger } from './engine';
import type { PeerMesh } from './peer-mesh';
import { captureCall, stopCallAudio, speakerOutput, switchCallCamera } from './call-platform';
import { directChatId } from './crypto';
import { callOutcome } from './call-record';

export type CallControl = Extract<Packet, { type: 'call' }>;
export type CallSignaling = { send(peer: string, control: CallControl): Promise<void> };
export type DeviceCall = {
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
  private listeners = new Set<() => void>();
  private controls = new Set<(value: CallControl) => void>();
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
    this.value = next;
    this.listeners.forEach((listener) => listener());
  }
  stage(code: string) {
    // Only caller-supplied constant codes, never peer IDs, SDP, messages or native error text.
    if (!/^[A-Z_]{1,48}$/.test(code) || !this.value) return;
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
      await this.send(peer, { type: 'call', id, action: 'invite', media });
      this.expire();
    } catch (error) {
      if (this.value?.id === id) await this.end(true);
      throw error;
    }
  }
  async receive(peer: string, control: CallControl, ringWindow?: number) {
    if (!(await this.engine.acceptsPeer(peer))) return;
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
      try {
        this.stage('MEDIA_OFFER');
        await this.mesh.startMedia(peer, call.id, call.local);
      } catch {
        if (this.value?.id === call.id) await this.end(true);
      }
    } else if (control.action === 'end' || control.action === 'decline')
      await this.end(false, false, control.action === 'decline' ? 'decline' : 'remote');
  }
  async accept() {
    const call = this.value;
    if (!call || call.status !== 'incoming') return;
    this.update({ ...call, status: 'connecting' });
    try {
      this.stage('CAPTURE_INCOMING');
      const stream = await captureCall(call.media === 'video');
      if (this.value?.id !== call.id || !this.active()) {
        stream.getTracks().forEach((track) => track.stop());
        if (!this.active()) await stopCallAudio();
        return;
      }
      this.update({ ...this.value, local: stream });
      this.stage('WAITING_FOR_MEDIA_OFFER');
      await this.send(call.peer, {
        type: 'call',
        id: call.id,
        action: 'accept',
        media: call.media,
      });
    } catch {
      if (this.value?.id === call.id) await this.end(true);
    }
  }
  allowedOffer(peer: string, id: string) {
    const call = this.value;
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
    return call?.peer === peer && call.id === id && !call.incoming && call.status === 'connecting';
  }
  connected(peer: string, id: string) {
    const call = this.value;
    if (call?.peer !== peer || call.id !== id || !this.active()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({ ...call, status: 'active', diagnostic: 'CONNECTED' });
  }
  remote(peer: string, id: string, stream: MediaStream) {
    const call = this.value;
    if (call?.peer === peer && call.id === id && this.active())
      this.update({ ...call, remote: stream });
  }
  async failed(peer: string, id: string) {
    if (this.value?.peer === peer && this.value.id === id && this.active()) await this.end(true);
  }
  async end(
    failed = false,
    notify = true,
    reason: 'local' | 'remote' | 'decline' | 'timeout' = 'local',
  ) {
    const call = this.value;
    if (!call || !this.active()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({ ...call, status: failed ? 'failed' : 'ended', local: null, remote: null });
    if (notify) {
      const control: CallControl = {
        type: 'call',
        id: call.id,
        media: call.media,
        action: call.status === 'incoming' ? 'decline' : 'end',
      };
      if (this.signaling) await this.send(call.peer, control).catch(() => undefined);
      else if (!this.mesh.send(call.peer, control))
        void this.mesh
          .waitForPeer(call.peer, () => true, 15000)
          .then(() => {
            this.mesh.send(call.peer, control);
          })
          .catch(() => undefined);
    }
    this.mesh.endMedia(call.peer, call.id);
    call.local?.getTracks().forEach((track) => track.stop());
    await stopCallAudio();
    await this.engine.recordCall(
      call.chat,
      call.id,
      call.peer,
      call.media,
      callOutcome(call, failed, reason),
      call.incoming ? 'incoming' : 'outgoing',
    );
  }
  mute() {
    const call = this.value;
    if (!call?.local) return;
    const muted = !call.muted;
    call.local.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.update({ ...call, muted });
  }
  camera() {
    const call = this.value;
    if (!call?.local || call.media !== 'video') return;
    const camera = !call.camera;
    call.local.getVideoTracks().forEach((track) => {
      track.enabled = camera;
    });
    this.update({ ...call, camera });
  }
  async speaker() {
    const call = this.value;
    if (!call) return;
    await speakerOutput(!call.speaker);
    if (this.value?.id === call.id) this.update({ ...this.value, speaker: !call.speaker });
  }
  async switchCamera() {
    const stream = this.value?.local;
    if (stream) await switchCallCamera(stream);
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.value?.local?.getTracks().forEach((track) => track.stop());
    this.update(null);
    void stopCallAudio().catch(() => undefined);
  }
}
