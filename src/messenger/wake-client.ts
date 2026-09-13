import type { PhoneClient } from './phone-client';
import type { DeviceMessenger } from './engine';
import type { WakeGrantPacket, WakeEvent } from './wake-protocol';
export class DeviceWake {
  private pending = new Map<string, Promise<void>>();
  private sent = new Map<string, number>();
  private revoking: Promise<void> | null = null;
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly client: Pick<PhoneClient, 'execute'>,
  ) {}
  async exchange(peer: string, send: (packet: WakeGrantPacket) => boolean) {
    if (!(await this.engine.acceptsPeer(peer))) return;
    const capability = await this.engine.ownWakeCapability(peer);
    await this.client.execute({ action: 'wake-grant', capability });
    if (await this.engine.acceptsPeer(peer)) send({ type: 'wake-grant', capability });
    else await this.client.execute({ action: 'wake-revoke', capability });
  }
  async receive(peer: string, capability: string) {
    await this.engine.savePeerWakeCapability(peer, capability);
  }
  async reconcile() {
    if (this.revoking) return this.revoking;
    const operation = (async () => {
      for (const row of await this.engine.wakeRevocations()) {
        await this.client.execute({ action: 'wake-revoke', capability: row.capability });
        await this.engine.acknowledgeWakeRevocation(row.capability);
      }
    })();
    this.revoking = operation;
    try {
      await operation;
    } finally {
      if (this.revoking === operation) this.revoking = null;
    }
  }
  async wake(peer: string, event: WakeEvent) {
    if (!(await this.engine.acceptsPeer(peer))) throw new Error('CONTACT_BLOCKED');
    const now = Date.now();
    for (const [id, expires] of this.sent) if (expires <= now) this.sent.delete(id);
    const id = peer + ':' + event.kind + ':' + event.id;
    if (this.sent.has(id)) return;
    const existing = this.pending.get(id);
    if (existing) return existing;
    if (this.pending.size >= 16 || this.sent.size >= 1024) throw new Error('PUSH_RATE_LIMITED');
    const operation = (async () => {
      const capability = await this.engine.peerWakeCapability(peer);
      if (!capability) throw new Error('PUSH_CONTACT_NOT_READY');
      await this.client.execute({ action: 'wake', capability, event });
      this.sent.set(id, now + 120000);
    })();
    this.pending.set(id, operation);
    try {
      await operation;
    } finally {
      this.pending.delete(id);
    }
  }
}
