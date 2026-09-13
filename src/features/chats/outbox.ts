import { z } from 'zod';
import { RepositoryError } from '@/services/repository';
import type { Message } from '@/types/domain';
export type OutboxContext = { ownerId: string; sessionId: string };
const messageSchema = z.object({
  clientId: z.string().uuid(),
  conversationId: z.string().min(1).max(128),
  senderId: z.string().min(1).max(128),
  text: z.string().trim().min(1).max(8000),
  createdAt: z.string().datetime(),
  replyTo: z.string().max(128).nullable(),
});
const entrySchema = z.object({
  message: messageSchema,
  attempts: z.number().int().min(0).max(8),
  nextAttemptAt: z.number().finite().nonnegative(),
  automatic: z.boolean(),
  failed: z.boolean(),
});
export type OutboxEntry = z.infer<typeof entrySchema>;
const snapshotSchema = z.object({
  version: z.literal(1),
  ownerId: z.string(),
  sessionId: z.string(),
  entries: z.array(entrySchema).max(20),
});
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export function pendingMessage(entry: OutboxEntry): Message {
  const m = entry.message;
  return {
    ...m,
    id: m.clientId,
    kind: 'text',
    status: entry.failed ? 'failed' : 'pending',
    deletedAt: null,
    attachmentId: null,
    durationSeconds: null,
    location: null,
    contact: null,
    reactions: [],
  };
}
// A whole bounded snapshot uses the existing atomic alternate-slot SecureStore adapter.
// This is a retry outbox, never a full message-history database or an E2EE implementation.
export class MessageOutbox {
  private serial: Promise<unknown> = Promise.resolve();
  private active: OutboxContext | null = null;
  private entries: OutboxEntry[] = [];
  private running = false;
  private sending: string | null = null;
  private loaded = false;
  private networkRetryAt = 0;
  constructor(
    private storage: Storage,
    private key: (owner: string) => Promise<string>,
    private changed: (entries: OutboxEntry[]) => void,
    private now = Date.now,
  ) {}
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.serial.then(action, action);
    this.serial = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private current(context: OutboxContext) {
    return this.active === context;
  }
  private async persist(context: OutboxContext, entries: OutboxEntry[]) {
    const raw = JSON.stringify({ version: 1, ...context, entries });
    if (entries.length > 20 || Array.from(raw).length > 24000)
      throw new RepositoryError('QUEUE_FULL');
    const key = await this.key(context.ownerId);
    try {
      await this.storage.setItem(key, raw);
    } catch (error) {
      // SecureStore's new slot may be committed before old-slot cleanup fails.
      // Confirm the exact snapshot; never turn an acknowledged write into a new message ID.
      let committed: string | null;
      try {
        committed = await this.storage.getItem(key);
      } catch {
        this.loaded = false;
        throw new RepositoryError('UNAVAILABLE');
      }
      if (committed !== raw) throw error;
    }
    if (this.current(context)) {
      this.entries = entries;
      this.changed(entries);
    }
  }
  async open(context: OutboxContext) {
    this.stop();
    this.active = context;
    await this.exclusive(async () => {
      const key = await this.key(context.ownerId);
      const raw = await this.storage.getItem(key);
      let entries: OutboxEntry[] = [];
      if (raw) {
        const saved = snapshotSchema.parse(JSON.parse(raw));
        if (saved.ownerId !== context.ownerId) throw new RepositoryError('UNAVAILABLE');
        if (saved.sessionId !== context.sessionId) await this.storage.removeItem(key);
        else {
          if (
            saved.entries.some((e) => e.message.senderId !== context.ownerId) ||
            new Set(saved.entries.map((e) => e.message.clientId)).size !== saved.entries.length
          )
            throw new RepositoryError('UNAVAILABLE');
          entries = saved.entries.map((entry) => ({ ...entry, failed: true }));
        }
      }
      if (this.current(context)) {
        this.loaded = true;
        this.entries = entries;
        this.changed(entries);
      }
    });
  }
  stop() {
    this.active = null;
    this.loaded = false;
    this.networkRetryAt = 0;
    this.entries = [];
    this.changed([]);
  }
  isReady() {
    return this.loaded;
  }
  nextDelayMs(): number | undefined {
    if (!this.loaded) return undefined;
    const seen = new Set<string>();
    const times = this.entries.flatMap((e) => {
      if (!e.automatic || seen.has(e.message.conversationId)) return [];
      seen.add(e.message.conversationId);
      return [Math.max(e.nextAttemptAt, this.networkRetryAt)];
    });
    return times.length ? Math.max(0, Math.min(...times) - this.now()) : undefined;
  }
  async erase(owner: string) {
    if (this.active?.ownerId === owner) this.stop();
    await this.exclusive(async () => this.storage.removeItem(await this.key(owner)));
  }
  async enqueue(message: Message) {
    const context = this.active;
    if (!context || message.senderId !== context.ownerId) throw new RepositoryError('UNAUTHORIZED');
    if (!this.loaded) throw new RepositoryError('UNAVAILABLE');
    const parsed = messageSchema.safeParse(message);
    if (!parsed.success || message.kind !== 'text') throw new RepositoryError('INVALID');
    await this.exclusive(async () => {
      if (!this.current(context)) throw new RepositoryError('UNAUTHORIZED');
      const prior = this.entries.find((e) => e.message.clientId === message.clientId);
      if (prior) {
        if (JSON.stringify(prior.message) !== JSON.stringify(parsed.data))
          throw new RepositoryError('CONFLICT');
        return;
      }
      await this.persist(context, [
        ...this.entries,
        { message: parsed.data, attempts: 0, nextAttemptAt: 0, automatic: true, failed: false },
      ]);
    });
  }
  async retry(id: string) {
    const context = this.active;
    if (!context || !this.loaded) throw new RepositoryError('UNAUTHORIZED');
    await this.exclusive(async () => {
      if (!this.current(context)) throw new RepositoryError('UNAUTHORIZED');
      this.networkRetryAt = 0;
      await this.persist(
        context,
        this.entries.map((e) =>
          e.message.clientId === id
            ? { ...e, attempts: 0, nextAttemptAt: 0, automatic: true, failed: false }
            : e,
        ),
      );
    });
  }
  async discard(id: string) {
    const context = this.active;
    if (!context || !this.loaded) throw new RepositoryError('UNAUTHORIZED');
    if (this.sending === id) throw new RepositoryError('CONFLICT');
    await this.exclusive(async () => {
      if (!this.current(context)) throw new RepositoryError('UNAUTHORIZED');
      if (this.sending === id) throw new RepositoryError('CONFLICT');
      await this.persist(
        context,
        this.entries.filter((e) => e.message.clientId !== id),
      );
    });
  }
  async flush(
    send: (message: Message) => Promise<Message>,
    canSend: () => boolean,
    acknowledged: (message: Message) => void,
  ) {
    const context = this.active;
    if (!context || !this.loaded || this.running || !canSend() || this.now() < this.networkRetryAt)
      return;
    this.running = true;
    try {
      for (let batch = 0; batch < 20 && this.current(context) && canSend(); batch++) {
        const next = this.entries.find(
          (e, index) =>
            e.automatic &&
            e.nextAttemptAt <= this.now() &&
            !this.entries
              .slice(0, index)
              .some(
                (prior) =>
                  prior.automatic && prior.message.conversationId === e.message.conversationId,
              ),
        );
        if (!next) break;
        const id = next.message.clientId;
        this.sending = id;
        const attempts = next.attempts + 1;
        await this.exclusive(async () => {
          if (!this.current(context)) return;
          await this.persist(
            context,
            this.entries.map((e) =>
              e.message.clientId === id
                ? {
                    ...e,
                    attempts,
                    failed: false,
                    nextAttemptAt: this.now() + Math.min(120000, 1000 * 2 ** attempts),
                    automatic: attempts < 8,
                  }
                : e,
            ),
          );
        });
        if (!this.current(context) || !canSend()) break;
        try {
          const sent = await send(pendingMessage(next));
          if (!this.current(context)) break;
          if (
            sent.clientId !== id ||
            sent.senderId !== context.ownerId ||
            sent.conversationId !== next.message.conversationId ||
            sent.status !== 'sent'
          )
            throw new RepositoryError('UNAVAILABLE');
          this.networkRetryAt = 0;
          // Remove only after server acknowledgment. If persistence fails, the same ID is safe to replay.
          await this.exclusive(async () => {
            if (this.current(context))
              await this.persist(
                context,
                this.entries.filter((e) => e.message.clientId !== id),
              );
          });
          if (this.current(context)) acknowledged(sent);
        } catch (error) {
          if (!this.current(context)) break;
          const transient =
            !(error instanceof RepositoryError) || ['UNAVAILABLE', 'OFFLINE'].includes(error.code);
          if (transient) this.networkRetryAt = this.now() + Math.min(120000, 1000 * 2 ** attempts);
          await this.exclusive(async () => {
            if (this.current(context))
              await this.persist(
                context,
                this.entries.map((e) =>
                  e.message.clientId === id
                    ? { ...e, automatic: transient && attempts < 8, failed: true }
                    : e,
                ),
              );
          });
          // One failed connection should not cause the whole queue to hammer an unavailable service.
          if (transient) break;
        } finally {
          this.sending = null;
        }
      }
    } finally {
      this.sending = null;
      this.running = false;
    }
  }
}
