import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/services/supabase/database.types';
import { readMessagePage } from '../../src/services/supabase/message-page';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'message page request budget, stable 2,000-row cursor, enrichment and block denial',
  { timeout: 60000 },
  async (t) => {
    const a = await testUser(c, '1601'),
      b = await testUser(c, '1602');
    t.after(async () => {
      await c.admin.auth.admin.deleteUser(a.id);
      await c.admin.auth.admin.deleteUser(b.id);
    });
    for (const [u, username] of [
      [a, 'dev_performance_a'],
      [b, 'dev_performance_b'],
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
    const request = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: 'Development performance test',
    });
    assert.ok(request.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: request.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const conversation = accepted.data;
    // Local-only privileged setup, actual recipient JWT for every measured read.
    const rows = Array.from({ length: 2000 }, () => ({
      id: randomUUID(),
      client_id: randomUUID(),
      conversation_id: conversation,
      sender_id: a.id,
      kind: 'text',
      body: 'Development load fixture',
      created_at: '2024-01-01T00:00:00.123456Z',
    }));
    for (let i = 0; i < rows.length; i += 200)
      assert.ok(!(await c.admin.from('messages').insert(rows.slice(i, i + 200))).error);
    const requests: string[] = [];
    const client = createClient<Database>(c.url, c.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => b.token,
      global: {
        fetch: async (input, init) => {
          requests.push(
            new URL(
              typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
            ).pathname,
          );
          return fetch(input, init);
        },
      },
    });
    const times: number[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 5; page++) {
      requests.length = 0;
      const started = performance.now();
      const result = await readMessagePage(client, conversation, cursor);
      times.push(performance.now() - started);
      assert.equal(result.items.length, 40);
      assert.equal(requests.length, 3, 'Text-only page performs exactly three network reads');
      assert.ok(!requests.some((path) => /message_(attachments|locations|contacts)/.test(path)));
      for (const item of result.items) {
        assert.ok(!seen.has(item.id));
        seen.add(item.id);
      }
      assert.ok(result.nextCursor);
      cursor = result.nextCursor;
    }
    assert.equal(seen.size, 200, 'Only requested pages fetched, no duplicates at tied timestamps');
    const shared = await a.client.rpc('send_contact_message', {
      conversation,
      contact: a.id,
      client_id: randomUUID(),
    });
    const point = await a.client.rpc('send_location_message', {
      conversation,
      latitude: 41.7,
      longitude: 44.7,
      label: 'Development point',
      client_id: randomUUID(),
    });
    assert.ok(shared.data && point.data);
    assert.ok(
      !(await b.client.rpc('toggle_message_reaction', { message: shared.data.id, emoji: '👍' }))
        .error,
    );
    assert.ok(
      !(
        await b.client.rpc('mark_conversation_read', {
          conversation,
          through_message: point.data.id,
        })
      ).error,
    );
    requests.length = 0;
    const mixed = await readMessagePage(client, conversation);
    assert.equal(requests.length, 5, 'Contact/location only add their own bounded reads');
    const contact = mixed.items.find((m) => m.id === shared.data!.id);
    assert.equal(contact?.contact?.username, 'dev_performance_a');
    assert.equal(contact?.reactions[0]?.emoji, '👍');
    assert.ok(contact?.readBy?.includes(b.id));
    assert.equal(mixed.items.find((m) => m.id === point.data!.id)?.location?.latitude, 41.7);
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    await assert.rejects(() => readMessagePage(client, conversation));
    times.sort((x, y) => x - y);
    t.diagnostic(
      'Local 2,000-row fixture: 5 × 40-message pages; 3 requests/text page; median=' +
        times[2]!.toFixed(1) +
        'ms; max=' +
        times[4]!.toFixed(1) +
        'ms. Not a device or production benchmark.',
    );
  },
);
