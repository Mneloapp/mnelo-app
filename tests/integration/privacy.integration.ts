import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'privacy: defaults, relevant/mutual discovery, opt-in phone and coarse-only profile location',
  { timeout: 30000 },
  async () => {
    const a = await testUser(c, '0951'),
      b = await testUser(c, '0952'),
      mutual = await testUser(c, '0953'),
      stranger = await testUser(c, '0954');
    for (const [u, username] of [
      [a, 'dev_privacy_a'],
      [b, 'dev_privacy_b'],
      [mutual, 'dev_privacy_mutual'],
      [stranger, 'dev_privacy_stranger'],
    ] as const) {
      assert.ok(
        !(
          await u.client.rpc('save_profile', {
            display_name: username,
            username,
            coarse_area: 'ვაკე',
          })
        ).error,
      );
      const defaults = await u.client
        .from('privacy_settings')
        .select('discoverability,phone_visibility,exact_location,request_audience')
        .single();
      assert.deepEqual(defaults.data, {
        discoverability: 'relevant',
        phone_visibility: 'nobody',
        exact_location: 'never',
        request_audience: 'relevant',
      });
    }
    assert.equal(
      (await a.client.rpc('profile_phone', { target: b.id })).data,
      null,
      'Hidden phone default',
    );
    assert.ok(
      (await a.client.from('profiles').select('phone').eq('id', b.id)).error,
      'No phone column in public profile',
    );
    assert.deepEqual(
      (await a.client.rpc('get_profile', { target: b.id })).data,
      [],
      'Relevant-only stranger hidden',
    );
    assert.deepEqual((await a.client.rpc('search_profiles', { query: 'dev_privacy_b' })).data, []);
    assert.ok(
      (
        await a.client
          .from('privacy_settings')
          .update({ phone_visibility: 'connections' })
          .eq('user_id', b.id)
      ).error,
      'Cannot alter another person’s privacy',
    );
    assert.ok(
      (
        await a.client
          .from('privacy_settings')
          .update({ exact_location: 'always' })
          .eq('user_id', a.id)
      ).error,
      'No public exact-location opt-in',
    );
    assert.ok(
      (
        await a.client.rpc('update_privacy', {
          discoverability: 'everyone',
          phone_visibility: 'everyone',
          request_audience: 'everyone',
        })
      ).error,
      'Unsupported privacy choice rejected',
    );
    for (const area of [
      '41.7151, 44.8271',
      '12 Rustaveli',
      'Rustaveli Avenue',
      'Main St',
      'რუსთაველის ქუჩა',
      'Vake\nHouse',
    ]) {
      assert.ok(
        (
          await a.client.rpc('save_profile', {
            display_name: 'Development privacy A',
            username: 'dev_privacy_a',
            coarse_area: area,
          })
        ).error,
        'Server rejects common precise-address input',
      );
    }
    for (const area of ['Vake', 'ვაკე', 'São Paulo', 'Saint-Germain', ''])
      assert.ok(
        !(
          await a.client.rpc('save_profile', {
            display_name: 'Development privacy A',
            username: 'dev_privacy_a',
            coarse_area: area,
          })
        ).error,
        'Coarse multilingual place accepted',
      );
    async function settings(
      u: typeof a,
      discoverability: 'relevant' | 'everyone' | 'nobody',
      requestAudience: 'relevant' | 'mutual' | 'everyone',
      phone: 'nobody' | 'connections' = 'nobody',
    ) {
      assert.ok(
        !(
          await u.client.rpc('update_privacy', {
            discoverability,
            request_audience: requestAudience,
            phone_visibility: phone,
          })
        ).error,
      );
    }
    for (const u of [a, b, mutual, stranger]) await settings(u, 'everyone', 'everyone');
    let visible = await stranger.client.rpc('get_profile', { target: b.id });
    assert.equal(visible.data?.length, 1);
    assert.ok(visible.data?.[0]);
    for (const field of ['phone', 'latitude', 'longitude', 'exact_location'])
      assert.ok(!(field in visible.data[0]));
    await settings(b, 'everyone', 'relevant');
    assert.equal(
      (await a.client.rpc('connection_state', { target: b.id })).data?.[0]?.can_request,
      false,
      'Visible does not imply request permission',
    );
    async function connect(sender: typeof a, recipient: typeof a) {
      const r = await sender.client.rpc('send_connection_request', {
        target: recipient.id,
        context: 'Development privacy connection',
      });
      assert.ok(r.data);
      assert.ok(
        !(
          await recipient.client.rpc('respond_connection_request', {
            request: r.data,
            action: 'accept',
          })
        ).error,
      );
    }
    await connect(a, mutual);
    await connect(b, mutual);
    await settings(b, 'everyone', 'mutual');
    assert.equal(
      (await a.client.rpc('connection_state', { target: b.id })).data?.[0]?.can_request,
      true,
      'Actual mutual connection permits request',
    );
    assert.equal(
      (await stranger.client.rpc('connection_state', { target: b.id })).data?.[0]?.can_request,
      false,
      'No mutual connection denies request',
    );
    assert.ok(!(await b.client.rpc('block_user', { target: mutual.id })).error);
    assert.equal(
      (await a.client.rpc('connection_state', { target: b.id })).data?.[0]?.can_request,
      false,
      'Blocked intermediary does not confer mutual permission',
    );
    assert.ok(
      !(await c.admin.from('blocks').delete().eq('user_id', b.id).eq('blocked_user_id', mutual.id))
        .error,
      'Local unblock fixture until Phase 13',
    );
    await connect(a, b);
    assert.equal(
      (await a.client.rpc('profile_phone', { target: b.id })).data,
      null,
      'Connected phone still hidden by default',
    );
    await settings(b, 'nobody', 'mutual', 'connections');
    assert.equal(
      (await a.client.rpc('profile_phone', { target: b.id })).data,
      '+15555550952',
      'Explicit opt-in exposes phone only to existing connection',
    );
    assert.equal(
      (await stranger.client.rpc('profile_phone', { target: b.id })).data,
      null,
      'Stranger cannot obtain shared phone',
    );
    assert.deepEqual(
      (await stranger.client.rpc('get_profile', { target: b.id })).data,
      [],
      'Nobody removes stranger discovery',
    );
    visible = await a.client.rpc('get_profile', { target: b.id });
    assert.equal(visible.data?.length, 1, 'Existing relationship keeps profile access');
    assert.ok(
      visible.data?.[0] && !('phone' in visible.data[0]),
      'Even authorized phone is absent from normal profile summary',
    );
    await settings(b, 'nobody', 'mutual');
    assert.equal(
      (await a.client.rpc('profile_phone', { target: b.id })).data,
      null,
      'Revocation affects next request immediately',
    );
    await settings(b, 'everyone', 'everyone', 'connections');
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    assert.equal(
      (await a.client.rpc('profile_phone', { target: b.id })).data,
      null,
      'Block overrides phone opt-in',
    );
    assert.deepEqual((await a.client.rpc('get_profile', { target: b.id })).data, []);
  },
);
