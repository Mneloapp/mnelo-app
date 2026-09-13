import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/services/supabase/database.types';
import { localContext } from './local-context';
export async function testUser(context: ReturnType<typeof localContext>, suffix: string) {
  assert.match(suffix, /^(0[3-9][0-9]{2}|1[0-9]{3})$/);
  const phone = '1555555' + suffix;
  const existing = await context.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ok(!existing.error, 'Local fixture listing');
  for (const user of existing.data.users.filter((u) => u.phone === phone)) {
    const removed = await context.admin.auth.admin.deleteUser(user.id);
    assert.ok(!removed.error, 'Reserved local fixture cleanup');
  }
  const password = randomUUID() + randomUUID();
  const created = await context.admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  assert.ok(!created.error && created.data.user, 'Reserved local fixture created');
  const client = createClient<Database>(context.url, context.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ phone, password });
  assert.ok(!login.error && login.data.session, 'Real local fixture login');
  return {
    client,
    id: created.data.user.id,
    token: login.data.session.access_token,
    async signInAgain() {
      const second = createClient<Database>(context.url, context.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const result = await second.auth.signInWithPassword({ phone, password });
      assert.ok(!result.error && result.data.session, 'Additional reserved local fixture login');
      return {
        client: second,
        token: result.data.session.access_token,
        refresh: result.data.session.refresh_token,
      };
    },
  };
}
