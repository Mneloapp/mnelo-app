export type PhoneRequestScheduler = <T>(request: () => Promise<T>) => Promise<T>;

// Leave room below the 120 requests/minute device budget for the share extension.
// A burst of old messages must not consume the inbox/call/receipt request budget.
export class PhoneRequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  constructor(
    private readonly now = Date.now,
    private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}
  readonly run: PhoneRequestScheduler = <T>(request: () => Promise<T>) => {
    const result = this.tail.then(async () => {
      const delay = Math.max(0, Math.min(60000, this.nextAt - this.now()));
      if (delay) await this.wait(delay);
      this.nextAt = this.now() + 750;
      try {
        return await request();
      } catch (error) {
        if (error instanceof Error && error.message === 'PHONE_RATE_LIMITED')
          this.nextAt = this.now() + 60000;
        throw error;
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  };
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
