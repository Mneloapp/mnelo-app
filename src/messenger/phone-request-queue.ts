export type PhoneRequestScheduler = <T>(request: () => Promise<T>, urgent?: boolean) => Promise<T>;

// Leave room below the 120 requests/minute device budget for the share extension.
// A burst of old messages must not consume the inbox/call/receipt request budget.
export class PhoneRequestQueue {
  private pending: { urgent: boolean; run: () => Promise<void> }[] = [];
  private draining = false;
  private nextAt = 0;
  constructor(
    private readonly now = Date.now,
    private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  readonly run: PhoneRequestScheduler = <T>(request: () => Promise<T>, urgent = false) =>
    new Promise<T>((resolve, reject) => {
      this.pending.push({
        urgent,
        run: async () => {
          try {
            resolve(await request());
          } catch (error) {
            if (error instanceof Error && error.message === 'PHONE_RATE_LIMITED')
              this.nextAt = this.now() + 60000;
            reject(error);
          }
        },
      });
      void this.drain();
    });
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    let urgentCount = 0;
    while (this.pending.length) {
      const delay = Math.max(0, Math.min(60000, this.nextAt - this.now()));
      if (delay) await this.wait(delay);
      const preferred = this.pending.findIndex((item) => item.urgent === urgentCount < 4);
      const [item] = this.pending.splice(preferred < 0 ? 0 : preferred, 1);
      urgentCount = item!.urgent ? urgentCount + 1 : 0;
      this.nextAt = this.now() + 750;
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
