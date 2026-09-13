import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { localContext } from './local-context';
import { testUser } from './fixtures';
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
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ],
    { env: c.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}
test('security: raw discovery bypass, concurrent limits, private schemas and privileged function grants', async () => {
  const a = await testUser(c, '1401'),
    b = await testUser(c, '1402');
  for (const [u, name] of [
    [a, 'dev_security_a'],
    [b, 'dev_security_b'],
  ] as const) {
    assert.ok(
      !(
        await u.client.rpc('save_profile', {
          display_name: name,
          username: name,
          capabilities: ['Electrical installation'],
        })
      ).error,
    );
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
  assert.equal((await a.client.rpc('get_profile', { target: b.id })).data?.[0]?.id, b.id);
  for (const table of [
    'profiles',
    'usernames',
    'user_capabilities',
    'profile_languages',
  ] as const) {
    const raw = await a.client.from(table).select('*');
    assert.ok(!raw.error);
    assert.ok(
      !raw.data?.some((row) => ('user_id' in row ? row.user_id : row.id) === b.id),
      table + ' cannot enumerate other identities',
    );
  }
  assert.equal((await a.client.from('verification_status').select('*')).error?.code, '42501');
  // Preload only this reserved local fixture's current bucket to test the real boundary concurrently.
  sql(
    `insert into private.rate_limits(user_id,action,window_start,attempts) values('${a.id}','profile_search',to_timestamp(floor(extract(epoch from now())/60)*60),59) on conflict(user_id,action,window_start) do update set attempts=59`,
  );
  const searches = await Promise.all(
    Array.from({ length: 3 }, () => a.client.rpc('search_profiles', { query: 'dev_security_b' })),
  );
  assert.equal(
    searches.filter((r) => r.error?.message === 'RATE_LIMITED').length,
    2,
    'Only one final permitted concurrent search',
  );
  assert.equal(searches.filter((r) => !r.error && r.data?.[0]?.id === b.id).length, 1);
  const bypass = await fetch(c.url + '/rest/v1/rpc/search_profiles?query=dev_security_b', {
    headers: { apikey: c.key, Authorization: 'Bearer ' + a.token },
  });
  assert.equal(bypass.status, 405, 'GET cannot bypass the volatile rate-limited RPC');
  const privateSchema = await fetch(c.url + '/rest/v1/rate_limits?select=*', {
    headers: { apikey: c.key, Authorization: 'Bearer ' + a.token, 'Accept-Profile': 'private' },
  });
  assert.equal(privateSchema.status, 406, 'Private helper schema is not exposed');
  assert.equal(
    sql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'execute')",
    ),
    '0',
    'No anonymous definer authority',
  );
  const privileged = [
    'complete_avatar',
    'claim_attachment',
    'complete_attachment',
    'publish_matching_request',
    'claim_push_work',
    'deletion_receipt_status',
    'claim_account_deletion',
    'finish_account_deletion',
    'observe_call_participants',
  ];
  for (const name of privileged) {
    assert.equal(
      sql(
        `select bool_and(not has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${name}'`,
      ),
      't',
      name + ' has no client execution grant',
    );
  }
  assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
  assert.deepEqual((await a.client.rpc('get_profile', { target: b.id })).data, []);
  assert.ok(
    (await a.client.rpc('send_connection_request', { target: b.id, context: 'Forbidden fixture' }))
      .error,
  );
  const denied = await a.client.functions.invoke('calls', {
    body: { action: 'token', call: randomUUID(), userId: b.id },
  });
  assert.ok(denied.error, 'Forged call actor is rejected');
});

test('security: server limits cover messaging, requests, reports, uploads, calls, interpretation and matching', async () => {
  const a = await testUser(c, '1411'),
    b = await testUser(c, '1412'),
    stranger = await testUser(c, '1413');
  for (const [u, name] of [
    [a, 'dev_rate_a'],
    [b, 'dev_rate_b'],
    [stranger, 'dev_rate_c'],
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
  const req = await a.client.rpc('send_connection_request', {
    target: b.id,
    context: 'Development rate fixture',
  });
  assert.ok(req.data);
  const accepted = await b.client.rpc('respond_connection_request', {
    request: req.data,
    action: 'accept',
  });
  assert.ok(accepted.data);
  const conversation = accepted.data;
  const intent = await a.client.functions.invoke('connect-intent', {
    body: {
      action: 'publish',
      clientId: randomUUID(),
      mode: 'need',
      rawText: 'I need an electrician in Vake',
      timeZone: 'Asia/Tbilisi',
      answers: {},
    },
  });
  assert.ok(!intent.error && intent.data.requestId);
  const fill = (action: string, maximum: number, seconds: number) =>
    sql(
      `insert into private.rate_limits(user_id,action,window_start,attempts) values('${a.id}','${action}',to_timestamp(floor(extract(epoch from now())/${seconds})*${seconds}),${maximum}) on conflict(user_id,action,window_start) do update set attempts=${maximum}`,
    );
  fill('message', 60, 60);
  assert.equal(
    (
      await a.client.rpc('send_text_message', {
        conversation,
        text_body: 'Must not be inserted',
        client_id: randomUUID(),
      })
    ).error?.message,
    'RATE_LIMITED',
  );
  assert.equal(
    (await a.client.from('messages').select('id').eq('conversation_id', conversation)).data?.length,
    0,
  );
  fill('request', 20, 3600);
  assert.equal(
    (
      await a.client.rpc('send_connection_request', {
        target: stranger.id,
        context: 'Must not be submitted',
      })
    ).error?.message,
    'RATE_LIMITED',
  );
  fill('report_hour', 5, 3600);
  assert.equal(
    (
      await a.client.rpc('submit_report', {
        target: b.id,
        reason: 'spam',
        detail: 'Development denied report',
        client_id: randomUUID(),
      })
    ).error?.message,
    'RATE_LIMITED',
  );
  fill('upload', 20, 3600);
  assert.equal(
    (
      await a.client.rpc('reserve_attachment', {
        conversation,
        client_id: randomUUID(),
        file_name: 'development.txt',
        mime_type: 'text/plain',
        byte_size: 10,
      })
    ).error?.message,
    'RATE_LIMITED',
  );
  fill('call_short', 3, 60);
  assert.equal(
    (await a.client.rpc('start_call', { conversation, media: 'voice', client_id: randomUUID() }))
      .error?.message,
    'RATE_LIMITED',
  );
  fill('matching', 60, 3600);
  assert.equal(
    (await a.client.rpc('find_matches', { request: intent.data.requestId })).error?.message,
    'RATE_LIMITED',
  );
  fill('connect_interpret', 40, 3600);
  const interpreted = await fetch(c.url + '/functions/v1/connect-intent', {
    method: 'POST',
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + a.token,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(interpreted.status, 429, 'Edge consumes its attempt before parsing an invalid body');
  assert.equal((await interpreted.json()).code, 'RATE_LIMITED');
});
