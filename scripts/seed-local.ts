import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/services/supabase/database.types';
import { localContext } from '../tests/integration/local-context';

async function main() {
  // Explicit development fixtures, never an automatic migration or a cloud seed.
  const context = localContext();
  assert.deepEqual(
    process.argv.slice(2),
    ['--reset-demo-users'],
    'LOCAL_SEED_EXPLICIT_RESET_REQUIRED',
  );
  const config = readFileSync('supabase/config.toml', 'utf8');
  const fixtures = [
    { phone: '15555550101', code: '123456', name: 'Nika', username: 'dev_nika', capabilities: [] },
    {
      phone: '15555550102',
      code: '234567',
      name: 'Giorgi',
      username: 'dev_giorgi',
      capabilities: ['Electrical installation'],
    },
    {
      phone: '15555550103',
      code: '345678',
      name: 'Mariam',
      username: 'dev_mariam',
      capabilities: [],
    },
  ];
  for (const item of fixtures)
    assert.ok(config.includes(`${item.phone} = "${item.code}"`), 'LOCAL_RESERVED_OTP_REQUIRED');
  const listed = await context.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ok(!listed.error && listed.data.users.length < 1000, 'LOCAL_SEED_BOUNDED_LIST_REQUIRED');
  for (const user of listed.data.users.filter((u) => fixtures.some((f) => f.phone === u.phone)))
    assert.ok(!(await context.admin.auth.admin.deleteUser(user.id)).error, 'LOCAL_FIXTURE_RESET');
  for (const fixture of fixtures) {
    const password = randomUUID() + randomUUID();
    const created = await context.admin.auth.admin.createUser({
      phone: fixture.phone,
      phone_confirm: true,
      password,
      app_metadata: { development_seed: 'mnelo-local-v1' },
    });
    assert.ok(!created.error, 'LOCAL_FIXTURE_CREATE');
    const client = createClient<Database>(context.url, context.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    assert.ok(
      !(await client.auth.signInWithPassword({ phone: fixture.phone, password })).error,
      'LOCAL_FIXTURE_LOGIN',
    );
    assert.ok(
      !(
        await client.rpc('save_profile', {
          display_name: 'Development ' + fixture.name,
          username: fixture.username,
          capabilities: fixture.capabilities,
          coarse_area: 'Vake',
        })
      ).error,
      'LOCAL_FIXTURE_PROFILE',
    );
    assert.ok(
      !(
        await client.rpc('update_profile_preferences', {
          languages: ['en', 'ka'],
          available_today: fixture.name === 'Giorgi',
          time_zone: 'Asia/Tbilisi',
        })
      ).error,
      'LOCAL_FIXTURE_PREFERENCES',
    );
    assert.ok(!(await client.auth.signOut({ scope: 'local' })).error, 'LOCAL_FIXTURE_LOGOUT');
  }
  console.log(
    'Three labelled local demo users prepared; privacy defaults retained; no connections created.',
  );
  console.log('Reserved phone numbers and test OTPs are documented in docs/END_TO_END_QA.md.');
}
void main().catch(() => {
  console.error(
    'LOCAL_SEED_FAILED: Require local backend, reserved OTP configuration and --reset-demo-users.',
  );
  process.exitCode = 1;
});
