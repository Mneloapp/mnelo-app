import { MessageOutbox, type OutboxEntry } from '@/features/chats/outbox';
import { createSecureSessionStorage } from '@/services/supabase/secure-session-storage';
import { RepositoryError } from '@/services/repository';
import type { Message } from '@/types/domain';
const context = { ownerId: 'development-a', sessionId: 'development-session-a' };
let clock = 1000;
function message(n = 1, owner = 'development-a'): Message {
  const id = '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
  return {
    id,
    clientId: id,
    conversationId: 'development-chat',
    senderId: owner,
    kind: 'text',
    text: 'Private development text ' + n,
    createdAt: '2026-09-08T00:00:00.000Z',
    replyTo: null,
    deletedAt: null,
    status: 'pending',
    attachmentId: null,
    durationSeconds: null,
    location: null,
    contact: null,
    reactions: [],
  };
}
function setup() {
  const backing = new Map<string, string>();
  const native = {
    getItemAsync: jest.fn(async (key: string) => backing.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      backing.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      backing.delete(key);
    }),
  };
  const storage = createSecureSessionStorage(native);
  let visible: OutboxEntry[] = [];
  const create = () =>
    new MessageOutbox(
      storage,
      async (owner) => 'mnelo.test.outbox.' + owner,
      (entries) => {
        visible = entries;
      },
      () => clock,
    );
  return { create, storage, native, backing, visible: () => visible };
}
beforeEach(() => {
  clock = 1000;
});
test('an uncertain server acknowledgment survives reconstruction and replays the original id without duplicates', async () => {
  const s = setup(),
    first = s.create();
  await first.open(context);
  await first.enqueue(message());
  const stored = new Map<string, Message>();
  const send = jest.fn(async (m: Message) => {
    stored.set(m.clientId, { ...m, status: 'sent' });
    throw new RepositoryError('UNAVAILABLE');
  });
  await first.flush(
    send,
    () => true,
    () => undefined,
  );
  first.stop();
  expect(stored.size).toBe(1);
  const restored = s.create();
  await restored.open({ ...context });
  clock += 5000;
  const acknowledged = jest.fn();
  await restored.flush(
    async (m) => stored.get(m.clientId)!,
    () => true,
    acknowledged,
  );
  expect(acknowledged).toHaveBeenCalledWith(
    expect.objectContaining({ clientId: message().clientId, status: 'sent' }),
  );
  expect(stored.size).toBe(1);
  expect(s.visible()).toEqual([]);
});
test('only one delivery runs while another message can be safely queued', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  let resolve!: (m: Message) => void;
  let began!: () => void;
  const started = new Promise<void>((done) => {
    began = done;
  });
  const send = jest.fn((m: Message): Promise<Message> =>
    m.clientId === message().clientId
      ? new Promise<Message>((r) => {
          resolve = r;
          began();
        })
      : Promise.resolve({ ...m, status: 'sent' }),
  );
  const delivery = box.flush(
    send,
    () => true,
    () => undefined,
  );
  await started;
  await box.enqueue(message(2));
  const duplicate = jest.fn();
  await box.flush(
    duplicate,
    () => true,
    () => undefined,
  );
  expect(duplicate).not.toHaveBeenCalled();
  await expect(box.discard(message().clientId)).rejects.toMatchObject({ code: 'CONFLICT' });
  resolve({ ...message(), status: 'sent' });
  await delivery;
  expect(send).toHaveBeenCalledTimes(2);
  expect(s.visible()).toHaveLength(0);
});
test('a new login never replays an older session queue, and another owner cannot enqueue', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  await box.open({ ...context, sessionId: 'new-development-session' });
  const send = jest.fn();
  await box.flush(
    send,
    () => true,
    () => undefined,
  );
  expect(send).not.toHaveBeenCalled();
  expect(s.visible()).toEqual([]);
  await expect(box.enqueue(message(2, 'development-b'))).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
test('storage failure preserves the previous committed queue and never publishes an unpersisted draft', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  s.native.setItemAsync.mockRejectedValueOnce(new Error('Development storage failure'));
  await expect(box.enqueue(message(2))).rejects.toBeDefined();
  expect(s.visible()).toHaveLength(1);
  const restored = s.create();
  await restored.open({ ...context });
  expect(s.visible().map((e) => e.message.clientId)).toEqual([message().clientId]);
});
test('corruption fails closed and does not overwrite an unreadable queue', async () => {
  const s = setup();
  await s.storage.setItem('mnelo.test.outbox.development-a', 'corrupt development fixture');
  const box = s.create();
  await expect(box.open(context)).rejects.toBeDefined();
  await expect(box.enqueue(message())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(await s.storage.getItem('mnelo.test.outbox.development-a')).toBe(
    'corrupt development fixture',
  );
});
test('a confirmed new SecureStore slot remains successful when cleanup of the old slot fails', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  const remove = s.native.deleteItemAsync.getMockImplementation()!;
  s.native.deleteItemAsync.mockImplementation(async (key) => {
    if (key === 'mnelo.test.outbox.development-a.a.0')
      throw new Error('Development old-slot cleanup failure');
    return remove(key);
  });
  await expect(box.enqueue(message(2))).resolves.toBeUndefined();
  expect(s.visible()).toHaveLength(2);
  const restored = s.create();
  await restored.open({ ...context });
  expect(s.visible()).toHaveLength(2);
});
test('an ambiguous storage acknowledgment prevents overwriting until the snapshot can be reloaded', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  s.native.setItemAsync.mockRejectedValueOnce(new Error('Development write failed'));
  const read = s.native.getItemAsync.getMockImplementation()!;
  let reads = 0;
  s.native.getItemAsync.mockImplementation(async (key) => {
    reads++;
    // Existing pointer/count are read before the failing write. Fail the subsequent confirmation read.
    if (reads >= 3) throw new Error('Development read failed');
    return read(key);
  });
  await expect(box.enqueue(message(2))).rejects.toBeDefined();
  expect(box.isReady()).toBe(false);
  await expect(box.enqueue(message(3))).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  s.native.getItemAsync.mockImplementation(read);
  await box.open({ ...context });
  expect(s.visible()).toHaveLength(1);
});
test('authorization and rate denial stop automatic retries until a deliberate retry', async () => {
  for (const code of ['FORBIDDEN', 'UNAUTHORIZED', 'RATE_LIMITED'] as const) {
    const s = setup(),
      box = s.create();
    await box.open(context);
    await box.enqueue(message());
    const send = jest.fn(async () => {
      throw new RepositoryError(code);
    });
    await box.flush(
      send,
      () => true,
      () => undefined,
    );
    clock += 300000;
    await box.flush(
      send,
      () => true,
      () => undefined,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(s.visible()[0]).toMatchObject({ automatic: false, failed: true });
    await box.retry(message().clientId);
    await box.flush(
      send,
      () => true,
      () => undefined,
    );
    expect(send).toHaveBeenCalledTimes(2);
  }
});
test('offline state and exponential backoff prevent repeated sends and preserve conversation order', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  await box.enqueue(message(2));
  const send = jest.fn(async () => {
    throw new RepositoryError('UNAVAILABLE');
  });
  await box.flush(
    send,
    () => false,
    () => undefined,
  );
  expect(send).not.toHaveBeenCalled();
  expect(box.nextDelayMs()).toBe(0);
  await box.flush(
    send,
    () => true,
    () => undefined,
  );
  await box.flush(
    send,
    () => true,
    () => undefined,
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(box.nextDelayMs()).toBe(2000);
  clock += 5000;
  const delivered: string[] = [];
  await box.flush(
    async (m) => {
      delivered.push(m.clientId);
      return { ...m, status: 'sent' };
    },
    () => true,
    () => undefined,
  );
  expect(delivered).toEqual([message().clientId, message(2).clientId]);
  expect(box.nextDelayMs()).toBeUndefined();
});
test('capacity is bounded without removing existing messages', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  for (let i = 1; i <= 20; i++) await box.enqueue(message(i));
  await expect(box.enqueue(message(21))).rejects.toMatchObject({ code: 'QUEUE_FULL' });
  expect(s.visible()).toHaveLength(20);
  const other = setup(),
    long = other.create();
  await long.open(context);
  await long.enqueue({ ...message(), text: 'x'.repeat(8000) });
  await long.enqueue({ ...message(2), text: 'x'.repeat(8000) });
  await expect(long.enqueue({ ...message(3), text: 'x'.repeat(8000) })).rejects.toMatchObject({
    code: 'QUEUE_FULL',
  });
  expect(other.visible()).toHaveLength(2);
});
test('an acknowledgment for a different message cannot discard the pending entry', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  const ack = jest.fn();
  await box.flush(
    async () => ({ ...message(2), status: 'sent' }),
    () => true,
    ack,
  );
  expect(ack).not.toHaveBeenCalled();
  expect(s.visible()[0]?.message.clientId).toBe(message().clientId);
  expect(s.visible()[0]?.failed).toBe(true);
});
test('logout clears the complete SecureStore snapshot and late acknowledgment cannot repopulate a different account', async () => {
  const s = setup(),
    box = s.create();
  await box.open(context);
  await box.enqueue(message());
  let resolve!: (m: Message) => void;
  let began!: () => void;
  const ready = new Promise<void>((r) => {
    began = r;
  });
  const ack = jest.fn();
  const delivery = box.flush(
    () =>
      new Promise<Message>((r) => {
        resolve = r;
        began();
      }),
    () => true,
    ack,
  );
  await ready;
  await box.erase(context.ownerId);
  await box.open({ ownerId: 'development-b', sessionId: 'development-b-session' });
  resolve({ ...message(), status: 'sent' });
  await delivery;
  expect(ack).not.toHaveBeenCalled();
  expect(s.visible()).toEqual([]);
  expect([...s.backing.keys()].filter((key) => key.includes('development-a'))).toEqual([]);
});
