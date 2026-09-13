import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import { waitForPostgres } from './realtime';
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
async function staleRead(token: string, path: string, body?: unknown) {
  const r = await fetch(c.url + '/rest/v1/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: c.key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
}
test(
  'devices: real multi-session logout, immediate stale-JWT denial, private listing, pagination and current session preservation',
  { timeout: 45000 },
  async (t) => {
    const a = await testUser(c, '1201'),
      b = await testUser(c, '1202');
    for (const [u, name] of [
      [a, 'dev_devices_a'],
      [b, 'dev_devices_b'],
    ] as const) {
      assert.ok(
        !(await u.client.rpc('save_profile', { display_name: name, username: name })).error,
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
    const second = await a.signInAgain();
    t.after(async () => {
      await second.client.removeAllChannels();
      await a.client.removeAllChannels();
      await b.client.removeAllChannels();
    });
    const firstSession = JSON.parse(Buffer.from(a.token.split('.')[1]!, 'base64url').toString())
      .session_id as string;
    const secondSession = JSON.parse(
      Buffer.from(second.token.split('.')[1]!, 'base64url').toString(),
    ).session_id as string;
    assert.notEqual(firstSession, secondSession);
    assert.ok(
      (
        await a.client.rpc('register_device', {
          device_name: 'Development iPhone fixture',
          platform: 'ios',
          os_version: '26.2',
        })
      ).data,
    );
    const secondDevice = await second.client.rpc('register_device', {
      device_name: 'Development browser fixture',
      platform: 'web',
      os_version: 'test',
    });
    assert.ok(secondDevice.data);
    const listed = await a.client.rpc('list_devices');
    assert.ok(!listed.error);
    assert.equal(listed.data?.length, 2);
    assert.equal(listed.data?.find((d) => d.is_current)?.id, firstSession);
    assert.equal((await second.client.rpc('current_device')).data?.[0]?.id, secondSession);
    assert.deepEqual(
      (await b.client.rpc('list_devices')).data?.map((d) => d.label),
      [''],
    );
    assert.ok(
      (await a.client.from('devices').select('*')).error,
      'Raw device rows are denied even to owner',
    );
    assert.ok(
      (await a.client.from('devices').update({ user_id: b.id }).eq('id', secondDevice.data)).error,
    );
    // Explicit reserved fixtures simulate many newer sessions, without generating external accounts.
    for (let i = 0; i < 21; i++)
      sql(
        `insert into auth.sessions(id,user_id,created_at,updated_at) values('${randomUUID()}','${a.id}',now()+interval '${i + 1} seconds',now())`,
      );
    const firstPage = await a.client.rpc('list_devices');
    assert.equal(firstPage.data?.length, 20);
    assert.ok(!firstPage.data?.some((d) => d.is_current), 'Current can be outside first page');
    assert.equal(
      (await a.client.rpc('current_device')).data?.[0]?.id,
      firstSession,
      'Separate current device remains available',
    );
    const last = firstPage.data!.at(-1)!;
    const next = await a.client.rpc('list_devices', {
      before_time: last.created_at,
      before_id: last.id,
    });
    assert.equal(next.data?.length, 3);
    assert.ok(!next.data?.some((d) => firstPage.data!.some((p) => p.id === d.id)));
    const req = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: 'Development session test',
    });
    assert.ok(req.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: req.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const conversation = accepted.data;
    const sent = await a.client.rpc('send_text_message', {
      conversation,
      text_body: 'Development session-only content',
      client_id: randomUUID(),
    });
    assert.ok(sent.data);
    assert.ok((await second.client.rpc('get_messages', { conversation })).data?.length);
    const events: string[] = [];
    const channel = second.client.channel('conversation:' + conversation, {
      config: { private: true },
    });
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.' + conversation,
      },
      (payload) => {
        events.push(String(payload.new.id));
      },
    );
    await waitForPostgres(channel);
    const baseline = await b.client.rpc('send_text_message', {
      conversation,
      text_body: 'Development stream before logout',
      client_id: randomUUID(),
    });
    assert.ok(baseline.data);
    const deadline = Date.now() + 6000;
    while (!events.includes(baseline.data.id) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(events.includes(baseline.data.id), 'Active session receives actual Realtime message');
    const loggedOut = await a.client.auth.admin.signOut(a.token, 'others');
    assert.ok(!loggedOut.error, 'Official Auth logout-others succeeds');
    const after = await b.client.rpc('send_text_message', {
      conversation,
      text_body: 'Development stream after logout',
      client_id: randomUUID(),
    });
    assert.ok(after.data);
    await new Promise((r) => setTimeout(r, 2000));
    assert.ok(!events.includes(after.data.id), 'Revoked live socket receives no new private event');
    await second.client.removeChannel(channel);
    const deniedChannel = second.client.channel('conversation:' + conversation, {
      config: { private: true },
    });
    const denied = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('TIMEOUT'), 8000);
      deniedChannel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });
    assert.equal(denied, 'CHANNEL_ERROR', 'Revoked token cannot rejoin private channel');
    await second.client.removeChannel(deniedChannel);

    assert.equal((await a.client.rpc('session_active')).data, true, 'Current remains authorized');
    assert.equal((await a.client.rpc('list_devices')).data?.length, 1);
    assert.equal((await staleRead(second.token, 'rpc/session_active', {})).data, false);
    assert.equal((await staleRead(second.token, 'rpc/get_messages', { conversation })).status, 403);
    assert.equal(
      (
        await staleRead(second.token, 'rpc/save_profile', {
          display_name: 'Stale',
          username: 'stale_dev',
        })
      ).status,
      403,
    );
    assert.deepEqual((await staleRead(second.token, 'messages?select=id')).data, []);
    assert.deepEqual((await staleRead(second.token, 'profiles?select=id')).data, []);
    assert.equal((await staleRead(second.token, 'rpc/list_devices', {})).status, 403);
    const edge = await fetch(c.url + '/functions/v1/calls', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + second.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'token', call: randomUUID() }),
    });
    assert.equal(edge.status, 401, 'Revoked user JWT denied before privileged Edge work');
    const refresh = await fetch(c.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: c.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: second.refresh }),
    });
    assert.ok(!refresh.ok, 'Real refresh token revoked');
    assert.equal((await b.client.rpc('session_active')).data, true, 'Other account unaffected');
    const currentSession = (await a.client.auth.getSession()).data.session;
    assert.ok(currentSession);
    assert.ok(!(await a.client.auth.admin.signOut(currentSession.access_token, 'local')).error);
    assert.equal(
      (await staleRead(a.token, 'rpc/session_active', {})).data,
      false,
      'Current logout invalidates current data access',
    );
    assert.deepEqual((await staleRead(a.token, 'messages?select=id')).data, []);
    const restored = await a.signInAgain();
    assert.equal(
      (await restored.client.rpc('session_active')).data,
      true,
      'Fresh login works after revocation',
    );
    await second.client.removeAllChannels();
    await restored.client.removeAllChannels();
  },
);
