import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'contextual requests: consent, atomic acceptance, retry, expiry, cursor and authorized Realtime',
  { timeout: 40000 },
  async (t) => {
    const a = await testUser(c, '0901'),
      b = await testUser(c, '0902'),
      outsider = await testUser(c, '0903'),
      other = await testUser(c, '0904');
    for (const [user, username] of [
      [a, 'dev_request_a'],
      [b, 'dev_request_b'],
      [outsider, 'dev_request_c'],
      [other, 'dev_request_d'],
    ] as const) {
      assert.ok(
        !(
          await user.client.rpc('save_profile', {
            display_name: username,
            username,
            capabilities: user === b ? ['Electrical installation'] : [],
            coarse_area: 'Request District',
          })
        ).error,
      );
      if (user !== b)
        assert.ok(
          !(
            await user.client.rpc('update_privacy', {
              discoverability: 'everyone',
              phone_visibility: 'nobody',
              request_audience: 'everyone',
            })
          ).error,
        );
    }
    t.after(async () => {
      for (const u of [a, b, outsider, other]) await u.client.removeAllChannels();
    });
    assert.ok(
      (await a.client.rpc('direct_conversation', { target: b.id })).error,
      'Unknown people cannot create a conversation',
    );
    assert.ok(
      (
        await a.client.rpc('send_connection_request', {
          target: b.id,
          context: 'Unmatched stranger',
        })
      ).error,
      'Relevant-only rejects unmatched request',
    );
    const publish = await fetch(c.url + '/functions/v1/connect-intent', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + a.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'publish',
        clientId: randomUUID(),
        mode: 'need',
        rawText: 'I need an electrician',
        timeZone: 'Asia/Tbilisi',
        answers: { area: 'Request District' },
      }),
    });
    assert.equal(publish.status, 200);
    const need = (await publish.json()).requestId as string;
    assert.ok(!(await a.client.rpc('find_matches', { request: need })).error);
    const preflight = await a.client.rpc('connection_state', {
      target: b.id,
      matching_request: need,
    });
    assert.ok(
      !preflight.error && preflight.data?.[0]?.can_request,
      'Current matched recipient is eligible',
    );
    const context = preflight.data[0].context;
    assert.equal(
      context,
      'Electrical installation\nRequest District',
      'Only reviewed structured context, not raw text',
    );
    const key = randomUUID();
    const input = {
      target: b.id,
      context,
      message: 'Development invitation: two ceiling lights.',
      matching_request: need,
      client_id: key,
    };
    assert.ok(
      (await a.client.rpc('send_connection_request', { ...input, context: 'Unreviewed raw text' }))
        .error,
      'Server rejects unreviewed matching context',
    );
    assert.ok(
      (await outsider.client.rpc('connection_state', { target: b.id, matching_request: need }))
        .error,
      'Cannot use another person’s matching request',
    );
    const events: { id: string; status: string }[] = [];
    let postgresReady = false;
    const channel = b.client
      .channel('inbox:' + b.id, { config: { private: true } })
      .on('system', {}, (payload) => {
        postgresReady = payload.extension === 'postgres_changes' && payload.status === 'ok';
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connection_requests' },
        (p) => {
          if ('id' in p.new) events.push({ id: String(p.new.id), status: String(p.new.status) });
        },
      );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('REALTIME_TIMEOUT')), 12000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          clearTimeout(timeout);
          reject(new Error('REALTIME_DENIED'));
        }
      });
    });
    for (let i = 0; i < 120 && !postgresReady; i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok(postgresReady, 'Postgres subscription is registered before sending');
    const sent = await a.client.rpc('send_connection_request', input);
    assert.ok(!sent.error && sent.data, 'Request persists');
    assert.equal(
      (await a.client.rpc('send_connection_request', input)).data,
      sent.data,
      'Same client key retries return original',
    );
    assert.ok(
      (await a.client.rpc('send_connection_request', { ...input, message: 'Changed' })).error,
      'Same key cannot replace request payload',
    );
    const pendingA = (await a.client.rpc('connection_state', { target: b.id })).data?.[0];
    const pendingB = (await b.client.rpc('connection_state', { target: a.id })).data?.[0];
    assert.equal(pendingA?.pending_request_id, sent.data);
    assert.equal(pendingA?.incoming, false);
    assert.equal(pendingA?.can_request, false);
    assert.equal(pendingB?.incoming, true);
    assert.ok(
      (await b.client.rpc('send_connection_request', { target: a.id, context: 'Crossed request' }))
        .error,
      'Opposite pending request never auto-accepts',
    );
    assert.ok(
      (await a.client.rpc('respond_connection_request', { request: sent.data, action: 'accept' }))
        .error,
      'Sender cannot accept',
    );
    assert.ok(
      (await b.client.rpc('respond_connection_request', { request: sent.data, action: 'cancel' }))
        .error,
      'Recipient cannot cancel',
    );
    assert.ok(
      (
        await outsider.client.rpc('respond_connection_request', {
          request: sent.data,
          action: 'accept',
        })
      ).error,
      'Outsider cannot respond',
    );
    assert.deepEqual(
      (await outsider.client.from('connection_requests').select('*').eq('id', sent.data)).data,
      [],
      'Requests are private',
    );
    for (
      let i = 0;
      i < 40 && !events.some((e) => e.id === sent.data && e.status === 'pending');
      i++
    )
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(
      events.some((e) => e.id === sent.data && e.status === 'pending'),
      'Actual incoming Realtime event',
    );
    const accepted = await b.client.rpc('respond_connection_request', {
      request: sent.data,
      action: 'accept',
    });
    assert.ok(!accepted.error && accepted.data, 'Recipient acceptance creates chat');
    assert.equal(
      (await b.client.rpc('respond_connection_request', { request: sent.data, action: 'accept' }))
        .data,
      accepted.data,
      'Acceptance retry returns same chat',
    );
    assert.equal(
      (await a.client.rpc('direct_conversation', { target: b.id })).data,
      accepted.data,
      'Direct lookup reopens exact chat',
    );
    const messages = await b.client.rpc('get_messages', { conversation: accepted.data });
    assert.equal(messages.data?.length, 1, 'Acceptance/retry inserts invitation once');
    assert.equal(messages.data?.[0]?.body, input.message);
    assert.equal(messages.data?.[0]?.sender_id, a.id);
    const link = (await a.client.from('connections').select('*').eq('request_id', sent.data))
      .data?.[0];
    assert.equal(link?.interaction_type, 'service', 'Purpose derives from trusted request');
    assert.equal(link?.context, context);
    assert.equal(
      (await a.client.rpc('connection_state', { target: b.id })).data?.[0]?.connected,
      true,
    );
    for (
      let i = 0;
      i < 40 && !events.some((e) => e.id === sent.data && e.status === 'accepted');
      i++
    )
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(
      events.some((e) => e.id === sent.data && e.status === 'accepted'),
      'Actual accepted Realtime event',
    );
    const declined = await a.client.rpc('send_connection_request', {
      target: other.id,
      context: 'Development decline',
    });
    assert.ok(declined.data);
    for (let i = 0; i < 2; i++)
      assert.ok(
        !(
          await other.client.rpc('respond_connection_request', {
            request: declined.data,
            action: 'decline',
          })
        ).error,
        'Decline idempotent',
      );
    assert.ok(
      (
        await a.client.rpc('send_connection_request', {
          target: other.id,
          context: 'Immediate retry',
        })
      ).error,
      'Decline cooldown prevents repeat requests',
    );
    const cancelled = await outsider.client.rpc('send_connection_request', {
      target: other.id,
      context: 'Development cancel',
    });
    assert.ok(cancelled.data);
    for (let i = 0; i < 2; i++)
      assert.ok(
        !(
          await outsider.client.rpc('respond_connection_request', {
            request: cancelled.data,
            action: 'cancel',
          })
        ).error,
        'Cancel idempotent',
      );
    const expired = await outsider.client.rpc('send_connection_request', {
      target: other.id,
      context: 'Development expiry',
    });
    assert.ok(expired.data);
    assert.ok(
      !(
        await c.admin
          .from('connection_requests')
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq('id', expired.data)
      ).error,
      'Local clock fixture only',
    );
    const response = await other.client.rpc('respond_connection_request', {
      request: expired.data,
      action: 'accept',
    });
    assert.equal(response.error?.message, 'EXPIRED');
    assert.equal(
      (await other.client.rpc('list_connection_requests')).data?.find((r) => r.id === expired.data)
        ?.status,
      'expired',
    );
    // Privileged local fixtures create tied historical timestamps; authorization/cursors use real Auth tokens.
    assert.ok(
      !(
        await c.admin.from('connection_requests').insert(
          Array.from({ length: 35 }, () => ({
            sender_id: a.id,
            recipient_id: other.id,
            context: 'Development history fixture',
            status: 'cancelled',
            created_at: '2024-01-01T00:00:00.123456Z',
          })),
        )
      ).error,
    );
    const first = await a.client.rpc('list_connection_requests');
    assert.equal(first.data?.length, 30);
    const last = first.data?.at(-1);
    assert.ok(last);
    const second = await a.client.rpc('list_connection_requests', {
      before_time: last.created_at,
      before_id: last.id,
    });
    assert.ok(!second.error);
    const history = [...first.data!, ...second.data!];
    assert.equal(history.length, 37);
    assert.equal(new Set(history.map((r) => r.id)).size, 37, 'Cursor ties preserve all rows once');
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    assert.ok(
      (await a.client.rpc('direct_conversation', { target: b.id })).error,
      'Block denies existing direct lookup',
    );
    assert.ok(
      (await a.client.rpc('send_connection_request', input)).error,
      'Block supersedes idempotent retry',
    );
    assert.ok(
      !(await a.client.rpc('list_connection_requests')).data?.some((r) => r.id === sent.data),
      'Blocked requests hidden',
    );
  },
);
