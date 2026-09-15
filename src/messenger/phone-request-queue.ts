export type PhoneRequestScheduler = <T>(request: () => Promise<T>, urgent?: boolean) => Promise<T>;

// The server allows 120 commands/minute, not one command every 750 ms.
// Allow a short handshake burst, then refill at 72/minute (at most 96 starts
// in any minute). Reserve four tokens for inbox/call/receipt traffic, leaving
// capacity for the share extension without delaying every idle request.
export class PhoneRequestQueue {
  private pending: { urgent: boolean; run: () => Promise<void> }[] = [];
  private draining = false;
  private pausedUntil = 0;
  private tokens = 24;
  private updatedAt: number;
  private wakeWait: (() => void) | undefined;
  constructor(
    private readonly now = Date.now,
    private readonly wait = (ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', finish);
          resolve();
        };
        const timer = setTimeout(finish, ms);
        signal?.addEventListener('abort', finish, { once: true });
      }),
  ) {
    this.updatedAt = now();
  }
  readonly run: PhoneRequestScheduler = <T>(request: () => Promise<T>, urgent = false) =>
    new Promise<T>((resolve, reject) => {
      this.pending.push({
        urgent,
        run: async () => {
          try {
            resolve(await request());
          } catch (error) {
            if (error instanceof Error && error.message === 'PHONE_RATE_LIMITED')
              this.pausedUntil = this.now() + 60000;
            reject(error);
          }
        },
      });
      if (urgent) this.wakeWait?.();
      void this.drain();
    });
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    let urgentCount = 0;
    while (this.pending.length) {
      const now = this.now();
      this.tokens = Math.min(24, this.tokens + (Math.max(0, now - this.updatedAt) * 72) / 60000);
      this.updatedAt = now;
      const preferUrgent = urgentCount < 4;
      let preferred = this.pending.findIndex((item) => item.urgent === preferUrgent);
      if (preferred < 0) preferred = 0;
      // Fairness cannot spend the urgent reserve on bulk work.
      if (!this.pending[preferred]!.urgent && this.tokens < 5) {
        const urgent = this.pending.findIndex((item) => item.urgent);
        if (urgent >= 0) preferred = urgent;
      }
      const required = this.pending[preferred]!.urgent ? 1 : 5;
      const delay = Math.ceil(
        Math.max(this.pausedUntil - now, ((required - this.tokens) * 60000) / 72, 0),
      );
      if (delay > 0) {
        // An urgent request can wake a bulk-budget wait immediately. It still
        // observes the shared rate-limit pause and token budget on the next pass.
        const controller = new AbortController();
        await Promise.race([
          this.wait(Math.min(60000, delay), controller.signal),
          new Promise<void>((resolve) => {
            this.wakeWait = resolve;
          }),
        ]);
        controller.abort();
        this.wakeWait = undefined;
        continue;
      }
      const [item] = this.pending.splice(preferred, 1);
      urgentCount = item!.urgent ? urgentCount + 1 : 0;
      this.tokens -= 1;
      await item!.run();
    }
    this.draining = false;
  }
}

const queues = new Map<string, PhoneRequestQueue>();
export function phoneRequestScheduler(address: string, key: string): PhoneRequestScheduler {
  if (!address.startsWith('https://')) return (request) => request();
  const id = address + ':' + key;
  let queue = queues.get(id);
  if (!queue) {
    queue = new PhoneRequestQueue();
    queues.set(id, queue);
  }
  return queue.run;
}
