import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import {
  dispatchPush,
  expoPushProvider,
  type PushQueue,
  type PushWork,
} from '../../supabase/functions/_shared/push';
const c = localContext();
function sql(query: string) {
  return execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_mnelo-local',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ],
    { env: c.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}
const queue: PushQueue = {
  async claim() {
    const r = await c.admin.rpc('claim_push_work');
    assert.ok(!r.error, 'Server claim succeeds');
    return r.data as PushWork[];
  },
  async payload(delivery, lease) {
    const r = await c.admin.rpc('push_payload', { delivery, lease });
    assert.ok(!r.error);
    return r.data;
  },
  async finish(work, result) {
    const r = await c.admin.rpc('finish_push_work', {
      delivery: work.delivery_id,
      lease: work.lease,
      outcome: result.outcome,
      ticket: result.ticket ?? null,
    });
    assert.ok(!r.error, 'Lease finish succeeds');
  },
};
test(
  'push: private tokens, live session binding, transactional events, retries, receipts and current authorization',
  { timeout: 45000 },
  async () => {
    const a = await testUser(c, '1001'),
      b = await testUser(c, '1002'),
      outsider = await testUser(c, '1003');
    for (const [user, username] of [
      [a, 'dev_push_a'],
      [b, 'dev_push_b'],
      [outsider, 'dev_push_other'],
    ] as const) {
      assert.ok(
        !(await user.client.rpc('save_profile', { display_name: username, username })).error,
      );
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
    const input = {
      device_name: 'Development iPhone fixture',
      platform: 'ios',
      os_version: '26.2',
    };
    const device = await b.client.rpc('register_device', input);
    assert.ok(!device.error && device.data);
    assert.equal(
      (await b.client.rpc('register_device', input)).data,
      device.data,
      'One device per actual session',
    );
    const senderDevice = await a.client.rpc('register_device', input);
    assert.ok(senderDevice.data);
    assert.ok(
      !(
        await a.client.rpc('register_push_token', {
          device: senderDevice.data,
          push_token: 'ExpoPushToken[mnelo_local_push_fixture_a_1001]',
        })
      ).error,
    );
    const otherDevice = await outsider.client.rpc('register_device', input);
    assert.ok(otherDevice.data);
    const token = 'ExpoPushToken[mnelo_local_push_fixture_b_1002]';
    const registration = { device: device.data, push_token: token };
    assert.ok(!(await b.client.rpc('register_push_token', registration)).error);
    assert.ok(
      (await a.client.rpc('register_push_token', registration)).error,
      'Cannot register another session device',
    );
    assert.ok(
      (
        await outsider.client.rpc('register_push_token', {
          device: otherDevice.data,
          push_token: token,
        })
      ).error,
      'Cannot steal live other-account token',
    );
    assert.ok(
      (await b.client.from('push_tokens').select('token')).error,
      'Own bearer tokens not readable',
    );
    assert.ok(
      (await outsider.client.from('push_tokens').select('*')).error,
      'Other tokens not readable',
    );
    assert.ok((await b.client.rpc('claim_push_work')).error, 'No client dispatcher');
    assert.ok(
      (
        await b.client.rpc('finish_push_work', {
          delivery: randomUUID(),
          lease: randomUUID(),
          outcome: 'provider_received',
        })
      ).error,
      'No client forged receipt',
    );
    const unauthenticated = await fetch(c.url + '/functions/v1/push-dispatch', { method: 'POST' });
    assert.equal(unauthenticated.status, 401);
    const authenticated = await fetch(c.url + '/functions/v1/push-dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + b.token },
    });
    assert.equal(authenticated.status, 401);
    const sent: { id: string; event: string }[] = [];
    const provider = {
      async send(push: string, id: string, event: string) {
        assert.ok(
          push.startsWith('ExpoPushToken[mnelo_local_push_fixture_'),
          'Only local fake tokens enter fixture provider',
        );
        sent.push({ id, event });
        return { outcome: 'ticket' as const, ticket: randomUUID() };
      },
      async receipt() {
        return { outcome: 'provider_received' as const };
      },
    };
    const request = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: 'Development push test',
    });
    assert.ok(request.data);
    await dispatchPush(queue, provider);
    assert.equal(
      sent.filter((x) => x.event === 'request').length,
      1,
      'Request enqueues exactly once',
    );
    const requestNotification = sent[0]!.id;
    assert.equal(
      (await b.client.rpc('resolve_notification', { notification: requestNotification })).data?.[0]
        ?.event_type,
      'request',
    );
    assert.deepEqual(
      (await outsider.client.rpc('resolve_notification', { notification: requestNotification }))
        .data,
      [],
      'Cross-account tap rejected',
    );
    const accepted = await b.client.rpc('respond_connection_request', {
      request: request.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const conversation = accepted.data;
    await dispatchPush(queue, provider);
    assert.equal(
      sent.filter((x) => x.event === 'accepted').length,
      1,
      'Acceptance notification delivered to original requester',
    );
    const call = await c.admin
      .from('call_sessions')
      .insert({
        conversation_id: conversation,
        caller_id: a.id,
        recipient_id: b.id,
        media: 'voice',
        room_ready: true,
        caller_session_id: JSON.parse(Buffer.from(a.token.split('.')[1]!, 'base64url').toString())
          .session_id,
      })
      .select('id')
      .single();
    assert.ok(
      !call.error && call.data,
      'Explicit development call record fixture, not an actual LiveKit call',
    );
    await dispatchPush(queue, provider);
    assert.equal(sent.filter((x) => x.event === 'call').length, 1, 'Incoming-call event queued');
    const callPush = sent.find((x) => x.event === 'call')!;
    assert.ok(
      (await b.client.rpc('resolve_notification', { notification: callPush.id })).data?.[0],
    );
    assert.ok(
      !(await c.admin.from('call_sessions').update({ status: 'declined' }).eq('id', call.data.id))
        .error,
    );
    assert.deepEqual(
      (await b.client.rpc('resolve_notification', { notification: callPush.id })).data,
      [],
      'Ended ringing cannot be opened',
    );

    await dispatchPush(queue, provider);
    assert.equal(
      sent.filter((x) => x.event === 'message').length,
      0,
      'Call history does not emit duplicate message pushes',
    );
    const send = async () => {
      const result = await a.client.rpc('send_text_message', {
        conversation,
        text_body: 'Development push private body',
        client_id: randomUUID(),
      });
      assert.ok(!result.error && result.data);
      return result.data!;
    };
    assert.ok(
      !(
        await b.client.rpc('save_profile', {
          display_name: 'dev_push_b',
          username: 'dev_push_b',
          capabilities: ['Electrical installation'],
          coarse_area: 'Push District',
        })
      ).error,
    );
    const published = await fetch(c.url + '/functions/v1/connect-intent', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + a.token,
        apikey: c.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'publish',
        clientId: randomUUID(),
        mode: 'need',
        rawText: 'I need an electrician',
        timeZone: 'Asia/Tbilisi',
        answers: { area: 'Push District' },
      }),
    });
    assert.equal(published.status, 200);
    const matchRequest = (await published.json()).requestId as string;
    assert.ok(!(await a.client.rpc('find_matches', { request: matchRequest })).error);
    await dispatchPush(queue, provider);
    assert.equal(
      sent.filter((x) => x.event === 'match').length,
      1,
      'Actual evidence emits one relevant-match event',
    );
    assert.ok(!(await a.client.rpc('find_matches', { request: matchRequest })).error);
    await dispatchPush(queue, provider);
    assert.equal(
      sent.filter((x) => x.event === 'match').length,
      1,
      'Refreshing matches does not repeat push',
    );
    assert.equal(
      sql("select active from cron.job where jobname='mnelo-push-dispatch'"),
      'f',
      'Scheduler remains inactive without deployment configuration',
    );
    assert.equal(
      sql('select private.invoke_push_worker()'),
      '',
      'Missing Vault config fails closed without external transport',
    );
    const first = await send();
    const [leaseA, leaseB] = await Promise.all([queue.claim(), queue.claim()]);
    const works = [...leaseA, ...leaseB].filter((x) => x.event_type === 'message');
    assert.equal(works.length, 1, 'Concurrent workers do not double-claim');
    const work = works[0]!;
    const payload = await queue.payload(work.delivery_id, work.lease);
    assert.ok(payload);
    assert.ok(!(await b.client.rpc('register_push_token', registration)).error);
    assert.ok(
      await queue.payload(work.delivery_id, work.lease),
      'Same token refresh preserves delivery',
    );
    await queue.finish({ ...work, lease: randomUUID() }, { outcome: 'PROVIDER' });
    assert.ok(
      await queue.payload(work.delivery_id, work.lease),
      'Wrong lease cannot complete work',
    );
    await queue.finish(work, { outcome: 'RETRY' });
    assert.equal(
      sql(`select state from private.push_deliveries where id='${work.delivery_id}'`),
      'pending',
    );
    sql(`update private.push_deliveries set next_attempt_at=now() where id='${work.delivery_id}'`);
    await dispatchPush(queue, provider);
    assert.equal(sent.filter((x) => x.event === 'message').length, 1);
    assert.equal(
      sql(`select state from private.push_deliveries where id='${work.delivery_id}'`),
      'ticket',
      'Ticket is not device delivery',
    );
    sql(`update private.push_deliveries set next_attempt_at=now() where id='${work.delivery_id}'`);
    await dispatchPush(queue, provider);
    assert.equal(
      sql(`select state from private.push_deliveries where id='${work.delivery_id}'`),
      'provider_received',
      'Receipt records provider handoff only',
    );
    assert.ok(
      !(await b.client.rpc('mark_conversation_read', { conversation, through_message: first.id }))
        .error,
    );
    assert.equal(
      (await b.client.rpc('resolve_notification', { notification: payload })).data?.[0]?.target_id,
      conversation,
      'Previously read notification opens authorized chat',
    );
    await send();
    const blockedWork = (await queue.claim()).find((x) => x.event_type === 'message');
    assert.ok(blockedWork);
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    assert.equal(
      await queue.payload(blockedWork.delivery_id, blockedWork.lease),
      null,
      'Block between claim and send rechecked',
    );
    assert.deepEqual(
      (await b.client.rpc('resolve_notification', { notification: payload })).data,
      [],
      'Blocked tap denied',
    );
    assert.ok(!(await b.client.rpc('unblock_user', { target: a.id })).error);
    // Finish this intentionally cancelled transport claim; no external notification was sent.
    await queue.finish(blockedWork, { outcome: 'PROVIDER' });
    assert.ok(
      !(
        await b.client.rpc('update_notification_preferences', {
          messages: false,
          requests: true,
          matches: true,
          calls: true,
        })
      ).error,
    );
    const suppressed = await send();
    await dispatchPush(queue, provider);
    assert.equal(
      sql(
        `select count(*) from private.push_deliveries d join private.notification_outbox o on o.id=d.outbox_id where o.entity_id='${suppressed.id}'`,
      ),
      '0',
      'Disabled category has no delivery',
    );
    assert.ok(
      !(
        await b.client.rpc('update_notification_preferences', {
          messages: true,
          requests: true,
          matches: true,
          calls: true,
        })
      ).error,
    );
    await send();
    const unregistered = (await queue.claim()).find((x) => x.event_type === 'message');
    assert.ok(unregistered);
    await queue.finish(unregistered, { outcome: 'UNREGISTERED' });
    const disabled = await c.admin
      .from('push_tokens')
      .select('disabled_at')
      .eq('device_id', device.data)
      .single();
    assert.ok(disabled.data?.disabled_at);
    assert.ok(
      !(await b.client.rpc('register_push_token', registration)).error,
      'Re-registration can enable again',
    );
    await send();
    const rotated = (await queue.claim()).find((x) => x.event_type === 'message');
    assert.ok(rotated);
    const replacement = 'ExpoPushToken[mnelo_local_push_fixture_b_rotated]';
    assert.ok(
      !(await b.client.rpc('register_push_token', { device: device.data, push_token: replacement }))
        .error,
    );
    await queue.finish(rotated, { outcome: 'UNREGISTERED' });
    assert.equal(
      (
        await c.admin
          .from('push_tokens')
          .select('disabled_at')
          .eq('device_id', device.data)
          .single()
      ).data?.disabled_at,
      null,
      'Old receipt cannot disable rotated token',
    );
    await send();
    const revoked = (await queue.claim()).find((x) => x.event_type === 'message');
    assert.ok(revoked);
    assert.ok(!(await b.client.auth.signOut({ scope: 'local' })).error);
    assert.equal(
      await queue.payload(revoked.delivery_id, revoked.lease),
      null,
      'Revoked Auth session cannot receive push',
    );
    const stale = await fetch(c.url + '/rest/v1/rpc/register_device', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + b.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    assert.equal(stale.status, 403, 'Still-unexpired JWT cannot register revoked session');
  },
);
test('Expo transport: generic payload, ticket/receipt separation and redacted error decisions', async () => {
  const responses: unknown[] = [
    { data: { status: 'ok', id: 'development-ticket' } },
    { data: { 'development-ticket': { status: 'ok' } } },
    { data: { status: 'error', details: { error: 'DeviceNotRegistered' } } },
    { data: { status: 'error', details: { error: 'MessageRateExceeded' } } },
    { data: {} },
  ];
  const payloads: Record<string, unknown>[] = [];
  const provider = expoPushProvider('local-test-placeholder', async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return Response.json(responses.shift());
  });
  const id = randomUUID();
  assert.equal((await provider.send('development-only', id, 'message', 86400)).outcome, 'ticket');
  assert.deepEqual(payloads[0]?.data, { notificationId: id });
  assert.equal(payloads[0]?.body, 'New message');
  assert.equal((await provider.receipt('development-ticket')).outcome, 'provider_received');
  assert.equal(
    (await provider.send('development-only', id, 'message', 30)).outcome,
    'UNREGISTERED',
  );
  assert.equal((await provider.send('development-only', id, 'message', 30)).outcome, 'RETRY');
  assert.equal((await provider.receipt('missing')).outcome, 'NO_RECEIPT');
});
