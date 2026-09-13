import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import { waitForPostgres } from './realtime';
const c = localContext();
test(
  'moderation: private reports, server-only actions, block revocation, private refresh and deliberate unblock',
  { timeout: 30000 },
  async (t) => {
    const a = await testUser(c, '0971'),
      b = await testUser(c, '0972'),
      other = await testUser(c, '0973'),
      hidden = await testUser(c, '0974');
    t.after(async () => {
      for (const u of [a, b, other, hidden]) await u.client.removeAllChannels();
    });
    for (const [u, username] of [
      [a, 'dev_safety_a'],
      [b, 'dev_safety_b'],
      [other, 'dev_safety_other'],
      [hidden, 'dev_safety_hidden'],
    ] as const) {
      assert.ok(!(await u.client.rpc('save_profile', { display_name: username, username })).error);
      if (u !== hidden)
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
      context: 'Development moderation connection',
    });
    assert.ok(request.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: request.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const chat = accepted.data;
    const message = await b.client.rpc('send_text_message', {
      conversation: chat,
      text_body: 'Explicit development report fixture',
      client_id: randomUUID(),
    });
    assert.ok(message.data);
    const input = {
      target: b.id,
      reason: 'spam',
      detail: 'Development report only.',
      message: message.data.id,
      client_id: randomUUID(),
    };
    const report = await a.client.rpc('submit_report', input);
    assert.ok(!report.error && report.data, 'Authenticated message report persists');
    assert.equal(
      (await a.client.rpc('submit_report', input)).data,
      report.data,
      'Retry idempotent',
    );
    assert.ok(
      (await a.client.rpc('submit_report', { ...input, detail: 'Changed' })).error,
      'Retry cannot replace evidence',
    );
    assert.ok(
      (await other.client.rpc('submit_report', { ...input, client_id: randomUUID() })).error,
      'Cannot report an inaccessible message',
    );
    assert.ok(
      (await a.client.rpc('submit_report', { ...input, target: other.id, client_id: randomUUID() }))
        .error,
      'Cannot attribute message to somebody else',
    );
    assert.ok(
      (await a.client.rpc('submit_report', { target: hidden.id, reason: 'spam' })).error,
      'Cannot enumerate/report an unknown hidden profile',
    );
    assert.ok(
      (await a.client.rpc('submit_report', { target: b.id, reason: 'other' })).error,
      'Other requires a concrete explanation',
    );
    assert.deepEqual(
      (await b.client.from('reports').select('*').eq('id', report.data)).data,
      [],
      'Subject cannot enumerate report or reporter',
    );
    assert.deepEqual(
      (await other.client.from('reports').select('*')).data,
      [],
      'Other clients cannot enumerate reports',
    );
    assert.ok(
      (await a.client.from('reports').update({ status: 'resolved' }).eq('id', report.data)).error,
      'Reporter cannot perform moderation',
    );
    assert.ok(
      (
        await a.client.rpc('resolve_report', {
          report: report.data,
          outcome: 'resolved',
          actor_reference: 'admin',
        })
      ).error,
      'Client-supplied admin label grants no authority',
    );
    assert.ok(
      !(
        await c.admin.rpc('resolve_report', {
          report: report.data,
          outcome: 'reviewing',
          actor_reference: 'local-integration-moderator',
        })
      ).error,
      'Trusted local moderation transition',
    );
    assert.equal(
      (await a.client.from('reports').select('status').eq('id', report.data).single()).data?.status,
      'reviewing',
    );
    const events: Record<string, unknown>[] = [];
    const channel = b.client
      .channel('inbox:' + b.id, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_access_state', filter: 'user_id=eq.' + b.id },
        (p) => events.push(p.new),
      );
    await waitForPostgres(channel);
    const pending = await a.client.rpc('send_connection_request', {
      target: other.id,
      context: 'Development request to cancel by block',
    });
    assert.ok(pending.data);
    assert.ok(!(await a.client.rpc('block_user', { target: other.id })).error);
    assert.equal(
      (await c.admin.from('connection_requests').select('status').eq('id', pending.data).single())
        .data?.status,
      'cancelled',
      'Block cancels pending request',
    );
    assert.ok(!(await a.client.rpc('block_user', { target: b.id })).error);
    for (let i = 0; i < 60 && !events.length; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(events.length, 1, 'Blocked peer receives own generic refresh event');
    assert.equal(events[0]?.user_id, b.id);
    assert.deepEqual(
      Object.keys(events[0]!).sort(),
      ['id', 'revision', 'updated_at', 'user_id'],
      'Refresh contains no blocker/reporter/content',
    );
    assert.deepEqual(
      (await b.client.from('blocks').select('*')).data,
      [],
      'Cannot enumerate who blocked you',
    );
    assert.deepEqual(
      (await b.client.from('user_access_state').select('*').eq('user_id', a.id)).data,
      [],
      'Cannot enumerate other access events',
    );
    assert.deepEqual((await b.client.rpc('get_profile', { target: a.id })).data, []);
    assert.deepEqual((await b.client.rpc('search_profiles', { query: 'dev_safety_a' })).data, []);
    assert.ok(
      (await b.client.rpc('direct_conversation', { target: a.id })).error,
      'Blocked direct access denied',
    );
    assert.ok(
      (
        await b.client.rpc('send_text_message', {
          conversation: chat,
          text_body: 'Blocked',
          client_id: randomUUID(),
        })
      ).error,
      'Blocked messaging denied',
    );
    assert.ok(
      (await b.client.rpc('send_connection_request', { target: a.id, context: 'Blocked' })).error,
      'Blocked request denied',
    );
    assert.equal(
      (await a.client.rpc('list_blocked_profiles')).data?.length,
      2,
      'Owner can manage own blocks',
    );
    assert.deepEqual((await b.client.rpc('list_blocked_profiles')).data, []);
    assert.ok(
      !(await b.client.rpc('unblock_user', { target: a.id })).error,
      'Unblocking a nonexistent own block is idempotent',
    );
    assert.deepEqual(
      (await b.client.rpc('get_profile', { target: a.id })).data,
      [],
      'Target cannot undo another actor’s block',
    );
    const afterBlock = await a.client.rpc('submit_report', {
      target: b.id,
      reason: 'harassment',
      detail: 'Development blocked-profile report',
      client_id: randomUUID(),
    });
    assert.ok(afterBlock.data, 'Own blocked profile can still be reported without disclosure');
    for (const target of [b, other])
      assert.ok(!(await a.client.rpc('unblock_user', { target: target.id })).error);
    assert.equal(
      (await a.client.rpc('direct_conversation', { target: b.id })).data,
      chat,
      'Unblock restores existing allowed connection',
    );
    assert.equal(
      (await a.client.from('connection_requests').select('status').eq('id', pending.data).single())
        .data?.status,
      'cancelled',
      'Unblock does not restore old pending request',
    );
    for (let i = 0; i < 3; i++)
      assert.ok(
        (
          await a.client.rpc('submit_report', {
            target: b.id,
            reason: 'spam',
            detail: 'Development rate boundary ' + i,
            client_id: randomUUID(),
          })
        ).data,
      );
    const limited = await a.client.rpc('submit_report', {
      target: b.id,
      reason: 'spam',
      detail: 'Development excess report',
      client_id: randomUUID(),
    });
    assert.equal(limited.error?.message, 'RATE_LIMITED');
    assert.equal(
      (await a.client.rpc('submit_report', input)).data,
      report.data,
      'Exact retry still works after quota',
    );
  },
);
