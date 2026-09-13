import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import { expoPushProvider, type PushWork } from '../../supabase/functions/_shared/push';
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
test(
  'locale: per-session preferences, private localized delivery and exact local-day expiry',
  { timeout: 30000 },
  async (t) => {
    const a = await testUser(c, '1701'),
      b = await testUser(c, '1702');
    t.after(async () => {
      await c.admin.auth.admin.deleteUser(a.id);
      await c.admin.auth.admin.deleteUser(b.id);
    });
    for (const [u, username] of [
      [a, 'dev_locale_a'],
      [b, 'dev_locale_b'],
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
    const second = await b.signInAgain();
    const info = { device_name: 'Development locale device', platform: 'ios', os_version: '26.2' };
    const firstDevice = await b.client.rpc('register_device', { ...info, locale: 'en' });
    const secondDevice = await second.client.rpc('register_device', { ...info, locale: 'ka' });
    assert.ok(firstDevice.data && secondDevice.data);
    assert.notEqual(firstDevice.data, secondDevice.data);
    assert.ok((await b.client.rpc('register_device', { ...info, locale: 'fr' })).error);
    assert.ok(
      (await a.client.from('devices').select('locale')).error,
      'Raw device data stays inaccessible',
    );
    for (const [client, device, token] of [
      [b.client, firstDevice.data, 'ExpoPushToken[mnelo_local_locale_en_1702]'],
      [second.client, secondDevice.data, 'ExpoPushToken[mnelo_local_locale_ka_1702]'],
    ] as const)
      assert.ok(!(await client.rpc('register_push_token', { device, push_token: token })).error);
    const request = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: 'Development locale request',
    });
    assert.ok(request.data);
    const destinations: PushWork[] = [];
    // The bounded worker processes 100 events per claim. Earlier fixture tombstones may
    // legitimately precede ours; exercise batches instead of assuming an empty queue.
    for (let batch = 0; batch < 30 && destinations.length < 2; batch++) {
      const work = await c.admin.rpc('claim_push_work');
      assert.ok(!work.error);
      destinations.push(
        ...((work.data ?? []) as PushWork[]).filter(
          (item) =>
            item.token.startsWith('ExpoPushToken[mnelo_local_locale_') &&
            item.token.endsWith('_1702]'),
        ),
      );
    }
    assert.deepEqual(destinations.map((item) => item.locale).sort(), ['en', 'ka']);
    const bodies: Record<string, unknown>[] = [];
    const provider = expoPushProvider('development-fixture-provider', async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { status: 'ok', id: 'development-fixture-ticket' } });
    });
    for (const item of destinations) {
      const payload = await c.admin.rpc('push_payload', {
        delivery: item.delivery_id,
        lease: item.lease,
      });
      assert.ok(payload.data);
      assert.equal(
        (await provider.send(item.token, payload.data, item.event_type, item.ttl, item.locale))
          .outcome,
        'ticket',
      );
      assert.ok(
        !(
          await c.admin.rpc('finish_push_work', {
            delivery: item.delivery_id,
            lease: item.lease,
            outcome: 'PROVIDER',
            ticket: null,
          })
        ).error,
      );
    }
    assert.deepEqual(
      bodies.map((body) => body.body).sort(),
      ['New connection request', 'კავშირის ახალი მოთხოვნა'].sort(),
    );
    for (const body of bodies) {
      assert.deepEqual(Object.keys(body.data as object), ['notificationId']);
      assert.equal(body.title, 'Mnelo');
    }
    const invalid = await provider.send('unused', 'unused', '__proto__', 60, 'ka');
    assert.equal(invalid.outcome, 'PROVIDER');
    for (const zone of ['Asia/Tbilisi', 'America/New_York', 'Pacific/Auckland']) {
      assert.ok(
        !(
          await a.client.rpc('update_profile_preferences', {
            languages: ['ka'],
            available_today: true,
            time_zone: zone,
          })
        ).error,
      );
      assert.equal(
        sql(
          `select available_until=((date_trunc('day',now() at time zone '${zone}')+interval '1 day') at time zone '${zone}') from public.profiles where id='${a.id}'`,
        ),
        't',
      );
    }
    assert.ok(
      (
        await a.client.rpc('update_profile_preferences', {
          languages: ['ka'],
          available_today: true,
          time_zone: 'Not/A_Zone',
        })
      ).error,
    );
    assert.ok(
      (await a.client.rpc('claim_push_work')).error,
      'Client cannot read delivery language or tokens',
    );
  },
);
