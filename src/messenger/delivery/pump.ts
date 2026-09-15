import type { PhoneClient } from '../phone-client';
import type { SignalJournal, RetryCode } from './journal';
import { deliveryResponse, type DeliveryCommand } from './schema';
import type { PublicKeys } from './signal';

export type DeliveryState = 'starting' | 'ready' | 'offline' | RetryCode;
type Receiver = (
  sender: string,
  body: string,
  context: { id: string; createdAt: number },
) => Promise<{ receipt?: { id: string; body: string } } | false>;
export type DeliveryHooks = {
  beforeCycle?: () => Promise<void>;
  beforeSend?: (peer: string, body: string) => Promise<boolean>;
  afterCycle?: () => Promise<void>;
  outgoingOnly?: boolean;
  outgoingTokens?: () => Promise<readonly string[]>;
};

// Transport orchestration only: retries never re-encrypt an existing outbox
// record. All advanced ratchet state and local inbox writes belong to the journal.
export class DeliveryPump {
  private stopped = true;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private retry = 1000;
  private wakePending = false;
  private incomingPending = false;
  private issue: RetryCode | undefined;
  private keysCheckedAt = 0;
  private keyCapacityReached = false;
  private serverCursor: { acceptedAt: number; sender: string; id: string } | undefined;
  private projectCursor: { createdAt: number; sender: string; id: string } | undefined;
  constructor(
    private readonly client: Pick<PhoneClient, 'execute'>,
    private readonly journal: SignalJournal,
    private readonly receive: Receiver,
    private readonly changed: (state: DeliveryState) => void,
    private readonly now = Date.now,
    private readonly hooks: DeliveryHooks = {},
  ) {}
  private async command(input: DeliveryCommand, urgent = false) {
    const response = await this.client.execute(input, urgent);
    if (this.stopped) throw new Error('DELIVERY_STOPPED');
    return deliveryResponse.parse(response.delivery);
  }
  async publish(keys: PublicKeys) {
    const { oneTime, ...identity } = keys;
    // Ordered batches preserve the directory's monotonic one-time-key watermark.
    const ordered = [...oneTime].sort((a, b) => a.id - b.id);
    let available = 0;
    for (let offset = 0; offset < ordered.length; offset += 100) {
      const result = await this.command({
        action: 'delivery-publish',
        keys: { ...identity, oneTime: ordered.slice(offset, offset + 100) },
        signature: this.journal.binding(keys),
      });
      if (result.availableKeys === undefined) throw new Error('DELIVERY_RESPONSE_INVALID');
      available = result.availableKeys;
    }
    return available;
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.changed('starting');
    this.schedule(0);
  }
  wake() {
    if (this.stopped) return;
    if (this.running) this.wakePending = true;
    else this.schedule(0);
  }
  receiveWake() {
    this.incomingPending = true;
    this.wake();
  }
  stop() {
    this.stopped = true;
    this.wakePending = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
  }
  async tick() {
    if (this.stopped) return;
    if (this.running) return this.running.catch(() => undefined); // The owning tick reports the failure once.
    this.issue = undefined;
    const operation = this.cycle();
    this.running = operation;
    try {
      await operation;
      if (!this.stopped) {
        this.changed(this.issue ?? 'ready');
        this.retry = 1000;
      }
    } catch (error) {
      if (!this.stopped) {
        const code = error instanceof Error ? error.message : '';
        this.changed(
          code.includes('IDENTITY_CHANGED')
            ? 'identity-changed'
            : code === 'DELIVERY_UNAVAILABLE'
              ? 'update-required'
              : 'offline',
        );
        this.retry = Math.min(60000, this.retry * 2);
      }
    } finally {
      if (this.running === operation) this.running = null;
      const immediate = this.wakePending;
      this.wakePending = false;
      this.schedule(immediate ? 0 : Math.max(3000, this.retry));
    }
  }
  private async pin(peer: string, urgent = false) {
    if (await this.journal.known(peer)) return;
    // Every queued message to an unready recipient shares this lookup. Without
    // a durable peer-level delay, a backlog exhausts the directory quota before
    // that recipient publishes their keys, blocking replies as well as sends.
    const retry = await this.journal.retry('identity', peer, peer);
    if (retry && retry.next_at > this.now()) {
      throw new Error(
        retry.code === 'peer-not-ready'
          ? 'DELIVERY_PEER_NOT_READY'
          : retry.code === 'identity-changed'
            ? 'SIGNAL_IDENTITY_CHANGED'
            : retry.code === 'update-required'
              ? 'DELIVERY_UNAVAILABLE'
              : 'DELIVERY_PEER_BACKOFF',
      );
    }
    try {
      const { identity } = await this.command({ action: 'delivery-identity', peer }, urgent);
      if (!identity) throw new Error('DELIVERY_PEER_NOT_READY');
      await this.journal.pin(identity);
      await this.journal.recovered('identity', peer, peer);
    } catch (error) {
      await this.journal.failed('identity', peer, peer, this.now(), this.failureCode(error));
      throw error;
    }
  }
  private async cycle() {
    if (!this.initialized) {
      await this.command({ action: 'delivery-status' });
      const keys = await this.journal.initialize();
      if (this.stopped) return;
      const available = await this.publish(keys);
      this.initialized = true;
      // Leased keys may have depleted the directory while the app was asleep.
      // Only skip the redundant startup status when publication confirms stock.
      this.keysCheckedAt = available >= 20 ? this.now() : 0;
    }
    const tokens = await this.hooks.outgoingTokens?.();
    // Call signals and delivery/read receipts precede media and housekeeping.
    // All journal mutation and encryption remain serial.
    await this.sendOutgoing(tokens, 2);
    await this.hooks.beforeCycle?.();
    if (!this.hooks.outgoingOnly) await this.receiveCycle();
    await this.maintainKeys();
    await this.journal.prune();
    await this.sendOutgoing(tokens);
    this.issue ??= await this.journal.outgoingIssue(tokens);
    await this.hooks.afterCycle?.();
  }
  private async sendOutgoing(tokens?: readonly string[], minPriority = 0) {
    const outgoing = await this.journal.readyOutgoing(tokens, minPriority);
    for (const row of outgoing) {
      if (this.stopped) return;
      // A remote delivery hint interrupts the bulk snapshot at a safe boundary.
      // The next serial cycle fetches it before any more ordinary uploads.
      if (minPriority < 2 && row.priority < 2 && this.incomingPending && !this.hooks.outgoingOnly)
        return;
      // Calls can arrive after readyOutgoing took its snapshot. Preempt between
      // bulk sends instead of waiting for the entire paced upload batch.
      if (minPriority < 2 && row.priority < 2) await this.sendOutgoing(tokens, 2);
      const urgent = row.priority >= 2;
      const retry = await this.journal.retry('send', row.peer, row.id);
      if (retry && retry.next_at > this.now()) {
        this.issue = retry.code;
        continue;
      }
      try {
        await this.pin(row.peer, urgent);
        if (this.hooks.beforeSend && !(await this.hooks.beforeSend(row.peer, row.body))) continue;
        const needBundle = await this.journal.needsBundle(row.peer);
        const leased = needBundle
          ? (
              await this.command(
                { action: 'delivery-keys', peer: row.peer, request: row.id },
                urgent,
              )
            ).keys
          : undefined;
        if (needBundle && !leased) throw new Error('DELIVERY_PEER_NOT_READY');
        if (leased) {
          const { oneTime: _oneTime, ...identity } = leased.bundle;
          await this.journal.pin({ ...identity, owner: row.peer, signature: leased.signature });
        }
        const envelope = await this.journal.seal(row.id, leased?.bundle);
        if (this.stopped) return;
        const { accepted } = await this.command({ action: 'delivery-submit', envelope }, urgent);
        if (!accepted) throw new Error('DELIVERY_RESPONSE_INVALID');
        await this.journal.uploaded(row.id);
        await this.journal.recovered('send', row.peer, row.id);
      } catch (error) {
        this.issue = this.failureCode(error);
        await this.journal.failed('send', row.peer, row.id, row.created_at, this.issue);
      }
    }
  }
  private async receiveCycle() {
    const urgent = this.incomingPending;
    this.incomingPending = false;
    // Project durable local inbox first; a crash cannot consume another prekey or
    // advance a ratchet twice while replaying this stage.
    await this.project();
    const { inbox } = await this.command(
      {
        action: 'delivery-inbox',
        ...(this.serverCursor ? { after: this.serverCursor } : {}),
      },
      urgent,
    );
    if (!inbox) throw new Error('DELIVERY_RESPONSE_INVALID');
    if (!inbox.length) this.serverCursor = undefined;
    for (const envelope of inbox) {
      if (this.stopped) return;
      await this.sendOutgoing(undefined, 2);
      const retry = await this.journal.retry('receive', envelope.sender, envelope.id);
      if (retry && retry.next_at > this.now()) this.issue = retry.code;
      else
        try {
          await this.pin(envelope.sender, urgent);
          await this.journal.receive(envelope);
          await this.journal.recovered('receive', envelope.sender, envelope.id);
        } catch (error) {
          this.issue = this.failureCode(error);
          await this.journal.failed(
            'receive',
            envelope.sender,
            envelope.id,
            envelope.createdAt,
            this.issue,
          );
        }
      // Advance past a bad item without acknowledging or discarding it. Retry
      // state survives restart; the server retains ciphertext until ACK/expiry.
      this.serverCursor = {
        acceptedAt: envelope.acceptedAt,
        sender: envelope.sender,
        id: envelope.id,
      };
    }
    await this.project();
    for (const row of await this.journal.acknowledgements()) {
      if (this.stopped || this.incomingPending) return;
      await this.sendOutgoing(undefined, 2);
      await this.command({ action: 'delivery-ack', sender: row.sender, id: row.id });
      await this.journal.acknowledged(row.sender, row.id);
    }
  }
  private async project() {
    let inbox = await this.journal.inbox(this.projectCursor);
    if (!inbox.length) {
      this.projectCursor = undefined;
      inbox = await this.journal.inbox();
    }
    for (const row of inbox) {
      if (this.stopped) return;
      await this.sendOutgoing(undefined, 2);
      const retry = await this.journal.retry('project', row.sender, row.id);
      if (retry && retry.next_at > this.now()) this.issue = retry.code;
      else
        try {
          const accepted = await this.receive(row.sender, row.body, {
            id: row.id,
            createdAt: row.created_at,
          });
          if (accepted !== false && !this.stopped) {
            await this.journal.applied(row.sender, row.id, accepted.receipt);
            await this.journal.recovered('project', row.sender, row.id);
          }
          await this.sendOutgoing(undefined, 2);
        } catch (error) {
          this.issue = this.failureCode(error);
          await this.journal.failed('project', row.sender, row.id, row.created_at, this.issue);
        }
      this.projectCursor = { createdAt: row.created_at, sender: row.sender, id: row.id };
    }
  }
  private failureCode(error: unknown): RetryCode {
    const message = error instanceof Error ? error.message : '';
    return message.includes('IDENTITY_CHANGED')
      ? 'identity-changed'
      : message === 'DELIVERY_PEER_NOT_READY'
        ? 'peer-not-ready'
        : message === 'DELIVERY_UNAVAILABLE'
          ? 'update-required'
          : 'message-error';
  }
  private async maintainKeys() {
    if (this.now() - this.keysCheckedAt >= 300000) {
      const status = await this.command({ action: 'delivery-status' });
      if (status.availableKeys === undefined) throw new Error('DELIVERY_RESPONSE_INVALID');
      let available = status.availableKeys;
      this.keyCapacityReached = false;
      if (available < 20) {
        // Re-publish locally committed keys first: the earlier HTTP response may
        // have been lost. Never regenerate/reuse an already allocated key ID.
        const keys = await this.journal.initialize();
        available = await this.publish(keys);
        if (available < 20) {
          const count = Math.min(50 - available, 200 - keys.oneTime.length);
          if (count > 0) await this.publish(await this.journal.replenish(count));
          else this.keyCapacityReached = true;
        }
      }
      this.keysCheckedAt = this.now();
    }
    // Retain leased private keys until safe retirement is implemented; never
    // sacrifice pending-message decryption to make room in an exhausted pool.
    if (this.keyCapacityReached) this.issue = 'message-error';
  }
}
