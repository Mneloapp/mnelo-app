import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import { waitForPostgres } from './realtime';
const context = localContext();
test(
  'direct messaging: persisted two-user delivery, cursors, authorization and reconnect',
  { timeout: 30000 },
  async (t) => {
    const a = await testUser(context, '0401'),
      b = await testUser(context, '0402'),
      stranger = await testUser(context, '0403');
    t.after(async () => {
      await Promise.all([
        a.client.removeAllChannels(),
        b.client.removeAllChannels(),
        stranger.client.removeAllChannels(),
      ]);
    });
    for (const [u, username] of [
      [a, 'dev_message_a'],
      [b, 'dev_message_b'],
      [stranger, 'dev_message_c'],
    ] as const) {
      assert.ok(!(await u.client.rpc('save_profile', { display_name: username, username })).error);
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
      context: 'Development message test',
    });
    assert.ok(!request.error && request.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: request.data,
      action: 'accept',
    });
    assert.ok(!accepted.error && accepted.data);
    const conversation = accepted.data;
    const events: string[] = [];
    async function subscribe() {
      const channel = b.client
        .channel('conversation:' + conversation, { config: { private: true } })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: 'conversation_id=eq.' + conversation,
          },
          (payload) => events.push(String(payload.new.id)),
        );
      // Channel authorization can finish before the database-change extension starts,
      // particularly after a clean database reset. Require the real PostgreSQL-ready event.
      await waitForPostgres(channel);
      return channel;
    }
    const outsider = stranger.client.channel('conversation:' + conversation, {
      config: { private: true },
    });
    const outsiderStatus = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('TEST_TIMEOUT'), 8000);
      outsider.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });
    assert.equal(outsiderStatus, 'CHANNEL_ERROR', 'Private Realtime topic rejects nonmember');
    await stranger.client.removeChannel(outsider);
    const channel = await subscribe();
    const clientId = randomUUID();
    const sent = await a.client.rpc('send_text_message', {
      conversation,
      text_body: 'Hello from development A',
      client_id: clientId,
    });
    assert.ok(!sent.error && sent.data, 'Persisted send succeeds');
    const duplicate = await a.client.rpc('send_text_message', {
      conversation,
      text_body: 'Hello from development A',
      client_id: clientId,
    });
    assert.ok(!duplicate.error);
    assert.equal(duplicate.data?.id, sent.data.id, 'Retry returns the same message');
    for (let i = 0; i < 40 && !events.includes(sent.data.id); i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(events.includes(sent.data.id), 'B receives authorized Realtime INSERT');
    assert.equal(
      (await b.client.rpc('list_conversations')).data?.[0]?.unread_count,
      1,
      'B sees one unread',
    );
    assert.ok(
      !(
        await b.client.rpc('mark_conversation_read', {
          conversation,
          through_message: sent.data.id,
        })
      ).error,
    );
    assert.equal(
      (await b.client.rpc('list_conversations')).data?.[0]?.unread_count,
      0,
      'Read cursor clears only seen messages',
    );
    assert.ok(
      (await stranger.client.rpc('get_messages', { conversation })).error,
      'Nonmember read denied',
    );
    assert.ok(
      (
        await stranger.client.rpc('send_text_message', {
          conversation,
          text_body: 'Spam',
          client_id: randomUUID(),
        })
      ).error,
      'Nonmember send denied',
    );
    assert.ok(
      (await b.client.rpc('delete_own_message', { message: sent.data.id })).error,
      'Recipient cannot delete sender message',
    );
    assert.ok(
      !(await b.client.rpc('toggle_message_reaction', { message: sent.data.id, emoji: '👍' }))
        .error,
      'Authorized reaction',
    );
    const reply = await b.client.rpc('send_text_message', {
      conversation,
      text_body: 'Reply from development B',
      client_id: randomUUID(),
      reply_to: sent.data.id,
    });
    assert.ok(!reply.error && reply.data, 'B replies');
    assert.equal(reply.data.reply_to, sent.data.id);
    await b.client.removeChannel(channel);
    const offline = await a.client.rpc('send_text_message', {
      conversation,
      text_body: 'Sent while receiver unsubscribed',
      client_id: randomUUID(),
    });
    assert.ok(!offline.error && offline.data);
    const reconnected = await subscribe();
    const history = await b.client.rpc('get_messages', { conversation });
    assert.ok(
      history.data?.some((m) => m.id === offline.data.id),
      'Reconnect fetch recovers persisted message',
    );
    // Insert tied timestamps as privileged local fixture setup, then read only with B's actual token.
    const time = '2024-01-01T00:00:00.123456Z';
    const fixture = Array.from({ length: 45 }, () => ({
      id: randomUUID(),
      conversation_id: conversation,
      sender_id: a.id,
      client_id: randomUUID(),
      kind: 'text',
      body: 'Development pagination fixture',
      created_at: time,
    }));
    assert.ok(
      !(await context.admin.from('messages').insert(fixture)).error,
      'Local pagination fixture seeded',
    );
    const first = await b.client.rpc('get_messages', { conversation });
    assert.equal(first.data?.length, 40, 'Page is bounded');
    const end = first.data?.at(-1);
    assert.ok(end);
    const second = await b.client.rpc('get_messages', {
      conversation,
      before_time: end.created_at,
      before_id: end.id,
    });
    assert.ok(!second.error);
    const all = [...first.data!, ...second.data!];
    assert.equal(all.length, 48, 'All tied-time messages recovered');
    assert.equal(new Set(all.map((m) => m.id)).size, 48, 'Stable cursor has no duplicates');
    assert.ok(!(await a.client.rpc('delete_own_message', { message: sent.data.id })).error);
    assert.equal(
      (await b.client.from('messages').select('body,deleted_at').eq('id', sent.data.id).single())
        .data?.body,
      '',
      'Deletion removes text',
    );
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    assert.ok(
      (
        await a.client.rpc('send_text_message', {
          conversation,
          text_body: 'Blocked',
          client_id: randomUUID(),
        })
      ).error,
      'Block denies existing chat sends',
    );
    assert.deepEqual(
      (await a.client.rpc('list_conversations')).data,
      [],
      'Blocked conversation not enumerated',
    );
    await b.client.removeChannel(reconnected);
  },
);
