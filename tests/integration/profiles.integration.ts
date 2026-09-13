import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const context = localContext();
test('profiles: ownership, uniqueness, privacy-filtered lookup and server-managed fields', async () => {
  const a = await testUser(context, '0301'),
    b = await testUser(context, '0302');
  const input = {
    display_name: 'Development Alice',
    username: 'dev_profile_alice',
    capabilities: ['Electrical installation'],
    coarse_area: 'Vake',
  };
  assert.ok(!(await a.client.rpc('save_profile', input)).error, 'Own profile created');
  const collision = await b.client.rpc('save_profile', {
    ...input,
    display_name: 'Development Bob',
  });
  assert.equal(collision.error?.code, '23505', 'Unique username enforced atomically');
  assert.ok(
    (await b.client.rpc('save_profile', { ...input, username: 'admin' })).error,
    'Reserved username rejected',
  );
  assert.ok(!(await b.client.rpc('save_profile', { ...input, username: 'dev_profile_bob' })).error);
  assert.deepEqual(
    (await a.client.rpc('get_profile', { target: b.id })).data,
    [],
    'Default relevant-only profile hidden from stranger',
  );
  assert.deepEqual(
    (await a.client.rpc('search_profiles', { query: 'dev_profile' })).data,
    [],
    'Search obeys relevant-only default',
  );
  assert.ok(
    !(
      await b.client.rpc('update_privacy', {
        discoverability: 'everyone',
        phone_visibility: 'nobody',
        request_audience: 'everyone',
      })
    ).error,
  );
  const search = await a.client.rpc('search_profiles', { query: '@dev_profile_b' });
  assert.ok(
    !search.error && search.data?.length === 1,
    'Explicit discoverability enables username lookup',
  );
  assert.ok(
    !('phone' in search.data[0]!) && !('latitude' in search.data[0]!),
    'Safe summary excludes phone and exact location',
  );
  assert.equal(search.data[0]?.verified, false, 'No invented verification');
  assert.equal(search.data[0]?.review_count, 0, 'Reputation comes from records');
  assert.ok(
    (await a.client.from('profiles').update({ display_name: 'Attacker' }).eq('id', b.id)).error,
    'Direct cross-user update denied',
  );
  assert.ok(
    (await a.client.rpc('complete_avatar', { actor: b.id, reservation: crypto.randomUUID() }))
      .error,
    'Privileged finalization denied',
  );
  assert.ok(
    !(
      await a.client.rpc('update_profile_preferences', {
        languages: ['en', 'ka'],
        available_today: true,
      })
    ).error,
  );
  const own = await a.client.rpc('get_profile', { target: a.id });
  assert.deepEqual(own.data?.[0]?.languages, ['en', 'ka']);
  assert.equal(own.data?.[0]?.available_today, true);
  const expiryFixture = await context.admin
    .from('profiles')
    .update({ available_until: '2020-01-01T00:00:00Z' })
    .eq('id', a.id);
  assert.equal(expiryFixture.error, null, 'Local expiry fixture must update');
  assert.equal(
    (await a.client.rpc('get_profile', { target: a.id })).data?.[0]?.available_today,
    false,
    'Expired availability is not asserted',
  );
  assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
  assert.deepEqual(
    (await a.client.rpc('search_profiles', { query: 'dev_profile_b' })).data,
    [],
    'Block suppresses discovery',
  );
});
test('avatars: authenticated processing, private storage, malformed input and unauthorized access', async () => {
  const a = await testUser(context, '0311'),
    b = await testUser(context, '0312');
  for (const [u, name] of [
    [a, 'dev_avatar_a'],
    [b, 'dev_avatar_b'],
  ] as const) {
    assert.ok(
      !(await u.client.rpc('save_profile', { display_name: 'Development avatar', username: name }))
        .error,
    );
  }
  const endpoint = context.url + '/functions/v1/avatar';
  const jpegBytes = jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 80).data;
  const unauth = await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: context.key, 'Content-Type': 'image/jpeg' },
    body: Uint8Array.from(jpegBytes).buffer,
  });
  assert.equal(unauth.status, 401, 'No token denied');
  const malformed = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: context.key,
      Authorization: 'Bearer ' + a.token,
      'Content-Type': 'image/jpeg',
    },
    body: '<html>not an image</html>',
  });
  assert.equal(malformed.status, 400, 'MIME spoof rejected by decoder');
  const upload = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: context.key,
      Authorization: 'Bearer ' + a.token,
      'Content-Type': 'image/jpeg',
    },
    body: Uint8Array.from(jpegBytes).buffer,
  });
  assert.equal(upload.status, 200, 'Authenticated avatar processed');
  const profile = (await a.client.rpc('get_profile', { target: a.id })).data?.[0];
  assert.ok(profile?.avatar_path);
  assert.ok(profile.avatar_path.startsWith(a.id + '/'));
  const own = await a.client.storage.from('avatars').createSignedUrl(profile.avatar_path, 60);
  assert.ok(!own.error && own.data.signedUrl, 'Owner authorized signed access');
  const image = await fetch(own.data.signedUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(
    jpeg.decode(Buffer.from(await image.arrayBuffer())).width,
    2,
    'Stored bytes decode as image',
  );
  const denied = await b.client.storage.from('avatars').createSignedUrl(profile.avatar_path, 60);
  assert.ok(denied.error, 'Unrelated user cannot sign private image');
  const direct = await b.client.storage
    .from('avatars')
    .upload(a.id + '/injected.jpg', jpegBytes, { contentType: 'image/jpeg' });
  assert.ok(direct.error, 'Client cannot bypass processing endpoint');
  await context.admin.storage.from('avatars').remove([profile.avatar_path]);
});
