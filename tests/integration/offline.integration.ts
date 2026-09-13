import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MessageOutbox, type OutboxEntry } from '../../src/features/chats/outbox';
import { RepositoryError } from '../../src/services/repository';
import type { Message } from '../../src/types/domain';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test('offline outbox: actual committed-message replay is idempotent and a new Auth session cannot replay an old queue', async () => {
  const a = await testUser(c, '1511'),
    b = await testUser(c, '1512');
  for (const [u, name] of [
    [a, 'dev_offline_a'],
    [b, 'dev_offline_b'],
  ] as const) {
    assert.ok(!(await u.client.rpc('save_profile', { display_name: name, username: name })).error);
    assert.ok(
      !(
        await u.client.rpc('update_privacy', {
          discoverability: 'everyone',
          phone_visibility: 'nobody',
          request_audience: 'everyone',
        })
      ).error,
    );
  }
  const request = await a.client.rpc('send_connection_request', {
    target: b.id,
    context: 'Development offline fixture',
  });
  assert.ok(request.data);
  const accepted = await b.client.rpc('respond_connection_request', {
    request: request.data,
    action: 'accept',
  });
  assert.ok(accepted.data);
  const sessionId = (await a.client.rpc('current_device')).data?.[0]?.id;
  assert.ok(sessionId);
  const backing = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => backing.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: async (key: string) => {
      backing.delete(key);
    },
  };
  let visible: OutboxEntry[] = [];
  let clock = Date.now();
  const create = () =>
    new MessageOutbox(
      storage,
      async (owner) => 'development-outbox-' + owner,
      (entries) => {
        visible = entries;
      },
      () => clock,
    );
  const clientId = randomUUID();
  const message: Message = {
    id: clientId,
    clientId,
    conversationId: accepted.data,
    senderId: a.id,
    kind: 'text',
    text: 'Development uncertain acknowledgment',
    createdAt: new Date().toISOString(),
    replyTo: null,
    deletedAt: null,
    status: 'pending',
    attachmentId: null,
    durationSeconds: null,
    location: null,
    contact: null,
    reactions: [],
  };
  let calls = 0;
  let firstServerId = '';
  const send = async (m: Message): Promise<Message> => {
    const result = await a.client.rpc('send_text_message', {
      conversation: m.conversationId,
      text_body: m.text,
      client_id: m.clientId,
    });
    assert.ok(result.data && !result.error);
    calls++;
    if (!firstServerId) firstServerId = result.data.id;
    assert.equal(result.data.id, firstServerId);
    return { ...m, id: result.data.id, status: 'sent' };
  };
  const box = create();
  await box.open({ ownerId: a.id, sessionId });
  await box.enqueue(message);
  await box.flush(
    send,
    () => false,
    () => undefined,
  );
  assert.equal(calls, 0, 'Offline state sends nothing');
  await box.flush(
    async (m) => {
      await send(m);
      throw new RepositoryError('UNAVAILABLE');
    },
    () => true,
    () => undefined,
  );
  assert.equal(calls, 1);
  assert.equal(visible.length, 1);
  box.stop();
  clock += 5000;
  const restored = create();
  await restored.open({ ownerId: a.id, sessionId });
  await restored.flush(
    send,
    () => true,
    () => undefined,
  );
  assert.equal(calls, 2);
  assert.equal(visible.length, 0);
  const received = await b.client
    .from('messages')
    .select('id,body,client_id')
    .eq('conversation_id', accepted.data);
  assert.equal(received.data?.length, 1);
  assert.equal(received.data?.[0]?.body, message.text);
  assert.equal(received.data?.[0]?.client_id, clientId);
  const pending = {
    ...message,
    id: randomUUID(),
    clientId: randomUUID(),
    text: 'Must not replay after logout',
  };
  await restored.enqueue(pending);
  assert.ok(!(await a.client.auth.signOut({ scope: 'local' })).error);
  const fresh = await a.signInAgain();
  const freshSession = (await fresh.client.rpc('current_device')).data?.[0]?.id;
  assert.ok(freshSession && freshSession !== sessionId);
  await restored.open({ ownerId: a.id, sessionId: freshSession });
  await restored.flush(
    async () => {
      throw new Error('OLD_SESSION_REPLAY');
    },
    () => true,
    () => undefined,
  );
  assert.equal(visible.length, 0);
  assert.equal(
    (await b.client.from('messages').select('id').eq('conversation_id', accepted.data)).data
      ?.length,
    1,
  );
});
