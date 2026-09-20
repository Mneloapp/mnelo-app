import type { PhoneClient } from '../phone-client';
import type { SignalJournal, RetryCode, Outgoing } from './journal';
import {
  deliveryResponse,
  type DeliveryCommand,
  type DeliveryEnvelope,
  type QueuedEnvelope,
} from './schema';
import type { PublicKeys } from './signal';

export type DeliveryState = 'starting' | 'ready' | 'offline' | RetryCode;
type Receiver = (
  sender: string,
  body: string,
  context: { id: string; createdAt: number },
  yieldToCalls: () => Promise<void>,
) => Promise<{ receipt?: { id: string; body: string } } | false>;
export type DeliveryHooks = {
  beforeCycle?: () => Promise<void>;
  beforeSend?: (peer: string, body: string, yieldToCalls: () => Promise<void>) => Promise<boolean>;
  afterCycle?: (yieldToCalls: () => Promise<void>) => Promise<void>;
  outgoingOnly?: boolean;
  outgoingTokens?: () => Promise<readonly string[]>;
};

// Transport orchestration only: retries never re-encrypt an existing outbox
// record. All advanced ratchet state and local inbox writes belong to the journal.
export class DeliveryPump {
  private stopped = true;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduledRevision = 0;
  private initialized = false;
  private retry = 1000;
  private wakePending = false;
  private incomingPending = false;
  private issue: RetryCode | undefined;
  private keysCheckedAt = 0;
  private keyCapacityReached = false;
  private syncSupported = false;
  private bufferedInbox: QueuedEnvelope[] = [];
  private lastInboxFetchAt = 0;
  private forcePoll = false;
  private serverHasMore = false;
  private serverCursor: { acceptedAt: number; sender: string; id: string } | undefined;
  private projectCursor: { createdAt: number; sender: string; id: string } | undefined;
  private uploadedThisCycle = new Set<string>();
  private callBurst = 0;
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
    this.scheduledRevision++;
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const revision = ++this.scheduledRevision;
    const run = () => {
      if (this.stopped || revision !== this.scheduledRevision) return;
      this.timer = null;
      void this.tick(false);
    };
    // An accepted call / native inbox wake must run even with the screen off.
    // Keep backoff on timers, but don't gate ready work on a display frame.
    if (delay === 0) queueMicrotask(run);
    else this.timer = setTimeout(run, delay);
  }
  async tick(forcePoll = true) {
    if (this.stopped) return;
    if (this.running) {
      // A caller joining an event-started cycle can still request its inbox
      // poll. Keep a single owner for encryption and error reporting.
      this.forcePoll ||= forcePoll;
      return this.running.catch(() => undefined);
    }
    this.issue = undefined;
    this.forcePoll = forcePoll;
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
    this.uploadedThisCycle.clear();
    this.callBurst = 0;
    if (!this.initialized) {
      try {
        const status = await this.command({
          action: 'delivery-status',
          ...(!this.hooks.outgoingOnly ? { capabilities: true as const } : {}),
        });
        this.syncSupported = status.sync === true;
      } catch (error) {
        // Older servers reject the opt-in field; their ordinary response stays
        // unchanged so older installed apps can also continue using that server.
        if (
          this.hooks.outgoingOnly ||
          !(error instanceof Error) ||
          error.message !== 'PHONE_REQUEST_FAILED'
        )
          throw error;
        await this.command({ action: 'delivery-status' });
      }
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
    // Recover persisted incoming calls before projecting their SDP/acceptance.
    await this.hooks.beforeCycle?.();
    // A submit may already have brought back the remote answer. Apply that
    // response before another upload round trip.
    const receivedEarly = this.bufferedInbox.length > 0;
    if (receivedEarly) await this.receiveCycle();
    // A submit exchange already fetches the inbox. Sending ordinary work first
    // avoids an empty poll before every message; a remote hint still preempts it.
    if (this.syncSupported) await this.sendOutgoing(tokens);
    if (
      !this.hooks.outgoingOnly &&
      (!receivedEarly || this.bufferedInbox.length || this.incomingPending)
    )
      await this.receiveCycle();
    await this.maintainKeys();
    await this.journal.prune();
    await this.sendOutgoing(tokens);
    this.issue ??= await this.journal.outgoingIssue(tokens);
    await this.hooks.afterCycle?.(() => this.sendOutgoing(tokens, 2, 4));
    if (this.bufferedInbox.length) this.wakePending = true;
    // Drain a successfully advancing backlog without adding the idle interval
    // between every bounded page. Blocked/failed/deferred work alone must not
    // create a busy loop or bypass its persisted retry deadline.
    if (this.uploadedThisCycle.size && (await this.journal.readyOutgoing(tokens)).length)
      this.wakePending = true;
  }
  private async sendOutgoing(tokens?: readonly string[], minPriority = 0, limit = Infinity) {
    const started = this.uploadedThisCycle.size;
    const outgoing = await this.journal.readyOutgoing(tokens, minPriority);
    for (const row of outgoing) {
      if (this.stopped) return;
      if (this.uploadedThisCycle.size - started >= limit) return;
      // Do not leave an encrypted answer/hangup in memory behind an entire
      // candidate or receipt batch. Decryption still has one serial owner.
      if (this.bufferedInbox.length && !this.hooks.outgoingOnly) return;
      if (this.uploadedThisCycle.has(row.id)) continue;
      // A remote delivery hint interrupts the bulk snapshot at a safe boundary.
      // The next serial cycle fetches it before any more ordinary uploads.
      if (
        minPriority < 2 &&
        row.priority < 2 &&
        (this.incomingPending || this.bufferedInbox.length > 0) &&
        !this.hooks.outgoingOnly
      )
        return;
      // Recheck between receipts too: an answer/SDP may have been enqueued while
      // the preceding receipt's HTTP request was in flight.
      if (minPriority < 3 && row.priority < 3)
        await this.sendOutgoing(tokens, 3, limit - (this.uploadedThisCycle.size - started));
      if (minPriority < 2 && row.priority < 2)
        await this.sendOutgoing(tokens, 2, limit - (this.uploadedThisCycle.size - started));
      if (this.uploadedThisCycle.size - started >= limit || this.bufferedInbox.length) return;
      if (this.uploadedThisCycle.has(row.id)) continue;
      // A candidate burst cannot starve delivery/read acknowledgements. Keep
      // one ready receipt moving per four successfully uploaded call events.
      if (row.priority === 3 && this.callBurst >= 4) {
        const receipt = (await this.journal.readyOutgoing(tokens, 2, 2))[0];
        if (receipt) await this.sendOne(receipt, tokens);
        this.callBurst = 0;
        if (this.uploadedThisCycle.size - started >= limit || this.bufferedInbox.length) return;
      }
      await this.sendOne(row, tokens);
    }
  }
  private async sendOne(row: Outgoing, tokens?: readonly string[]) {
    if (this.stopped || this.uploadedThisCycle.has(row.id)) return;
    const urgent = row.priority >= 2;
    const retry = await this.journal.retry('send', row.peer, row.id);
    if (retry && retry.next_at > this.now()) {
      this.issue = retry.code;
      return;
    }
    try {
      await this.pin(row.peer, urgent);
      if (
        this.hooks.beforeSend &&
        !(await this.hooks.beforeSend(row.peer, row.body, () =>
          this.sendOutgoing(tokens, row.priority >= 2 ? 3 : 2, 4),
        ))
      )
        return;
      const needBundle = await this.journal.needsBundle(row.peer);
      const leased = needBundle
        ? (await this.command({ action: 'delivery-keys', peer: row.peer, request: row.id }, urgent))
            .keys
        : undefined;
      if (needBundle && !leased) throw new Error('DELIVERY_PEER_NOT_READY');
      if (leased) {
        const { oneTime: _oneTime, ...identity } = leased.bundle;
        await this.journal.pin({ ...identity, owner: row.peer, signature: leased.signature });
      }
      const envelope = await this.journal.seal(row.id, leased?.bundle);
      if (this.stopped) return;
      const { accepted } = this.syncSupported
        ? await this.sync(envelope, urgent)
        : await this.command({ action: 'delivery-submit', envelope }, urgent);
      if (!accepted) throw new Error('DELIVERY_RESPONSE_INVALID');
      await this.journal.uploaded(row.id);
      this.uploadedThisCycle.add(row.id);
      this.callBurst = row.priority === 3 ? this.callBurst + 1 : 0;
      await this.journal.recovered('send', row.peer, row.id);
    } catch (error) {
      this.issue = this.failureCode(error);
      await this.journal.failed('send', row.peer, row.id, row.created_at, this.issue);
    }
  }
  private async sync(envelope?: DeliveryEnvelope, urgent = false) {
    const acknowledgements = await this.journal.acknowledgements();
    const receive = !this.hooks.outgoingOnly && this.bufferedInbox.length === 0;
    const result = await this.command(
      {
        action: 'delivery-sync',
        ...(envelope ? { envelope } : {}),
        acknowledgements,
        ...(this.serverCursor ? { after: this.serverCursor } : {}),
        receive,
      },
      urgent,
    );
    if (receive && !result.inbox) throw new Error('DELIVERY_RESPONSE_INVALID');
    await this.journal.acknowledgedBatch(acknowledgements);
    if (result.inbox) {
      this.lastInboxFetchAt = this.now();
      this.serverHasMore = result.inbox.length === 20;
      const last = result.inbox.at(-1);
      this.serverCursor = last
        ? { acceptedAt: last.acceptedAt, sender: last.sender, id: last.id }
        : undefined;
      this.bufferedInbox.push(...result.inbox);
      // The encrypted receipt's round trip can carry the next message or call
      // signal. The current cycle projects it without an additional poll.
    }
    return result;
  }
  private async receiveCycle() {
    const urgent = this.incomingPending;
    this.incomingPending = false;
    // Project durable local inbox first; a crash cannot consume another prekey or
    // advance a ratchet twice while replaying this stage.
    await this.project();
    if (this.syncSupported) {
      if (
        !this.bufferedInbox.length &&
        (urgent ||
          this.forcePoll ||
          this.serverHasMore ||
          this.now() - this.lastInboxFetchAt >= 3000)
      )
        await this.sync(undefined, urgent);
      // Keep each cycle bounded; every unacknowledged ciphertext is still on the
      // server if the process is interrupted before its local journal commit.
      let processed = 0;
      do {
        const inbox = this.bufferedInbox.splice(0, 20);
        processed += inbox.length;
        await this.receiveEnvelopes(inbox, urgent);
        await this.project();
      } while (this.bufferedInbox.length && processed < 40 && !this.stopped);
      if (this.bufferedInbox.length) this.wakePending = true;
      return;
    }
    const { inbox } = await this.command(
      {
        action: 'delivery-inbox',
        ...(this.serverCursor ? { after: this.serverCursor } : {}),
      },
      urgent,
    );
    if (!inbox) throw new Error('DELIVERY_RESPONSE_INVALID');
    if (!inbox.length) this.serverCursor = undefined;
    await this.receiveEnvelopes(inbox, urgent);
    await this.project();
    for (const row of await this.journal.acknowledgements()) {
      if (this.stopped || this.incomingPending) return;
      await this.sendOutgoing(undefined, 2);
      await this.command({ action: 'delivery-ack', sender: row.sender, id: row.id });
      await this.journal.acknowledged(row.sender, row.id);
    }
  }
  private async receiveEnvelopes(inbox: QueuedEnvelope[], urgent: boolean) {
    if (inbox.length === 20) this.wakePending = true;
    for (const envelope of inbox) {
      if (this.stopped) return;
      await this.sendOutgoing(undefined, 3, 1);
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
      if (!this.syncSupported)
        this.serverCursor = {
          acceptedAt: envelope.acceptedAt,
          sender: envelope.sender,
          id: envelope.id,
        };
    }
  }
  private async project() {
    let inbox = await this.journal.inbox(this.projectCursor);
    if (!inbox.length) {
      this.projectCursor = undefined;
      inbox = await this.journal.inbox();
    }
    let applied = 0;
    for (const row of inbox) {
      if (this.stopped) return;
      await this.sendOutgoing(undefined, 3, 1);
      const retry = await this.journal.retry('project', row.sender, row.id);
      if (retry && retry.next_at > this.now()) this.issue = retry.code;
      else
        try {
          const accepted = await this.receive(
            row.sender,
            row.body,
            {
              id: row.id,
              createdAt: row.created_at,
            },
            () => this.sendOutgoing(undefined, 2, 4),
          );
          if (accepted !== false && !this.stopped) {
            await this.journal.applied(row.sender, row.id, accepted.receipt);
            await this.journal.recovered('project', row.sender, row.id);
            applied++;
          }
          // Delivery/read receipts should not wait for all other attachments
          // in this inbox page. Calls retain higher priority and burst fairness.
          await this.sendOutgoing(undefined, 2, 1);
        } catch (error) {
          this.issue = this.failureCode(error);
          await this.journal.failed('project', row.sender, row.id, row.created_at, this.issue);
        }
      this.projectCursor = { createdAt: row.created_at, sender: row.sender, id: row.id };
    }
    if (inbox.length === 20 && applied) this.wakePending = true;
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
