import type { DeliveryStore } from '../identity/delivery-store';
import type { WakeService } from './service';

// Persisted intent is created in the ciphertext submission transaction. Provider
// failures cannot roll back a server-accepted message or lose its push work.
export class DeliveryNotificationWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private running: Promise<void> | null = null;
  constructor(
    private readonly store: DeliveryStore,
    private readonly wake: Pick<WakeService, 'deliverQueued'>,
    private readonly now = Date.now,
  ) {}
  start() {
    this.stopped = false;
    this.schedule(0);
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  wakeNow() {
    if (!this.stopped) this.schedule(0);
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick().catch(() => undefined);
    }, delay);
    this.timer.unref?.();
  }
  async tick() {
    if (this.stopped) return;
    if (this.running) return this.running;
    const operation = this.cycle();
    this.running = operation;
    try {
      await operation;
    } finally {
      if (this.running === operation) this.running = null;
      this.schedule(1000);
    }
  }
  private async cycle() {
    // Four concurrent provider requests at a time; bounded database page and
    // independent backoff keep an invalid token from owning the queue head.
    const jobs = this.store.notifications();
    for (let offset = 0; offset < jobs.length && !this.stopped; offset += 4) {
      await Promise.all(
        jobs.slice(offset, offset + 4).map(async (job) => {
          if (this.stopped) return;
          // The page can wait behind earlier provider requests. A recipient
          // that has since consumed the invite owns its call outcome; its ACK
          // removes this job and must suppress a stale missed-call fallback.
          if (
            !this.store.allowed(job.sender, job.recipient) ||
            !this.store.hasPending(job.recipient, job.sender, job.id)
          ) {
            this.store.notificationResult(job);
            return;
          }
          const ringing = job.event.kind === 'call' && job.created_at + 60000 > this.now();
          const missed = job.event.kind === 'call' && !ringing;
          const event = missed ? { kind: 'message' as const, id: job.event.id } : job.event;
          let accepted = false;
          try {
            accepted = await this.wake.deliverQueued(job.sender, job.recipient, event, {
              expiresAt: ringing ? job.created_at + 60000 : job.expires_at,
              ...(missed ? { missedCall: true } : {}),
            });
          } catch {
            /* Stable retry state only. Never persist provider bodies/tokens. */
          }
          if (this.stopped) return;
          if (accepted && !ringing) this.store.notificationResult(job);
          else
            this.store.notificationResult(job, {
              nextAt:
                accepted && ringing
                  ? job.created_at + 60000
                  : this.now() + Math.min(60000, 1000 * 2 ** Math.min(6, job.attempts + 1)),
              attempts: accepted ? job.attempts : Math.min(100000, job.attempts + 1),
              ringDone: Boolean(job.ring_done) || (accepted && ringing),
            });
        }),
      );
    }
  }
}
