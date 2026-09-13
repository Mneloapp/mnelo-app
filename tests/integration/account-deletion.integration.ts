import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { RoomServiceClient } from 'livekit-server-sdk';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
const values = Object.fromEntries(
  readFileSync('artifacts/local-livekit/.env.local', 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
assert.equal(values.MNELO_SERVER_ENV, 'local');
assert.equal(values.LIVEKIT_PUBLIC_URL, 'ws://127.0.0.1:7880');
const rooms = new RoomServiceClient(
  'http://127.0.0.1:7880',
  values.LIVEKIT_API_KEY,
  values.LIVEKIT_API_SECRET,
  { requestTimeout: 10 },
);
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
async function endpoint(
  receipt: string,
  action: 'request' | 'status',
  token?: string,
  extra?: unknown,
) {
  const response = await fetch(c.url + '/functions/v1/account-deletion', {
    method: 'POST',
    headers: {
      apikey: c.key,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ action, receipt, ...((extra as object) ?? {}) }),
  });
  return { code: response.status, data: await response.json() };
}
async function cleanup() {
  return c.admin.functions.invoke('account-cleanup', { body: {} });
}
test(
  'account deletion: real Storage/Auth removal, durable receipts, concurrent related accounts, group continuity, authorization and late-file sweep',
  { timeout: 120000 },
  async (t) => {
    const temporary: { bucket: 'avatars' | 'chat-media'; path: string }[] = [];
    t.after(async () => {
      for (const item of temporary) await c.admin.storage.from(item.bucket).remove([item.path]);
    });
    const a = await testUser(c, '1301'),
      b = await testUser(c, '1302'),
      d = await testUser(c, '1303');
    for (const [u, name] of [
      [a, 'dev_delete_a'],
      [b, 'dev_delete_b'],
      [d, 'dev_delete_c'],
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
    let direct = '';
    for (const peer of [b, d]) {
      const req = await a.client.rpc('send_connection_request', {
        target: peer.id,
        context: 'Development deletion fixture',
      });
      assert.ok(req.data);
      const accepted = await peer.client.rpc('respond_connection_request', {
        request: req.data,
        action: 'accept',
      });
      assert.ok(accepted.data);
      if (peer === b) direct = accepted.data;
    }
    const group = await a.client.rpc('create_group', {
      name: 'Development deletion group',
      members: [b.id, d.id],
      client_id: randomUUID(),
    });
    assert.ok(group.data);
    const text = await a.client.rpc('send_text_message', {
      conversation: direct,
      text_body: 'Development content to erase',
      client_id: randomUUID(),
    });
    assert.ok(text.data);
    const peerText = await b.client.rpc('send_text_message', {
      conversation: direct,
      text_body: 'Development peer content to preserve',
      client_id: randomUUID(),
    });
    assert.ok(peerText.data);
    assert.ok(
      (
        await d.client.rpc('send_text_message', {
          conversation: group.data,
          text_body: 'Development related account content',
          client_id: randomUUID(),
        })
      ).data,
    );
    const path = a.id + '/' + direct + '/' + randomUUID() + '/development-file';
    const peerPath = b.id + '/' + direct + '/' + randomUUID() + '/development-file';
    temporary.push({ bucket: 'chat-media', path }, { bucket: 'chat-media', path: peerPath });
    for (const key of [path, peerPath])
      assert.ok(
        !(
          await c.admin.storage
            .from('chat-media')
            .upload(key, new TextEncoder().encode('Explicit local deletion file fixture'), {
              contentType: 'text/plain',
            })
        ).error,
      );
    const attachment = randomUUID();
    const inserted = await c.admin.from('message_attachments').insert({
      id: attachment,
      user_id: a.id,
      conversation_id: direct,
      object_path: path,
      file_name: 'development.txt',
      mime_type: 'text/plain',
      byte_size: 36,
      status: 'ready',
      client_id: randomUUID(),
    });
    assert.ok(!inserted.error);
    const sentFile = await a.client.rpc('send_attachment_message', {
      attachment,
      caption: '',
      client_id: randomUUID(),
    });
    assert.ok(sentFile.data);
    const avatarPath = a.id + '/' + randomUUID() + '.jpg';
    temporary.push({ bucket: 'avatars', path: avatarPath });
    assert.ok(
      !(
        await c.admin.storage
          .from('avatars')
          .upload(avatarPath, new Uint8Array([255, 216, 255, 217]), { contentType: 'image/jpeg' })
      ).error,
      'Explicit storage-deletion fixture, not an image-processing test',
    );
    assert.ok(
      !(await c.admin.from('profiles').update({ avatar_path: avatarPath }).eq('id', a.id)).error,
    );
    const started = await a.client.functions.invoke('calls', {
      body: { action: 'start', conversation: direct, media: 'voice', clientId: randomUUID() },
    });
    assert.ok(!started.error);
    const room = 'mnelo-call-' + started.data.id;
    t.after(async () => {
      await c.admin.functions.invoke('call-cleanup', { body: {} });
    });
    assert.equal((await rooms.listRooms([room])).length, 1, 'Actual room exists before deletion');
    assert.ok(
      !(
        await b.client.functions.invoke('calls', {
          body: { action: 'accept', call: started.data.id },
        })
      ).error,
    );
    const receiptA = randomBytes(32).toString('hex'),
      receiptD = randomBytes(32).toString('hex');
    assert.equal((await endpoint(receiptA, 'request')).code, 401);
    assert.equal(
      (await endpoint(receiptA, 'request', b.token, { userId: a.id })).code,
      400,
      'Client-supplied actor rejected',
    );
    assert.equal(
      (await endpoint(randomBytes(32).toString('hex'), 'status')).data.status,
      'not_found',
    );
    const requested = await Promise.all([
      endpoint(receiptA, 'request', a.token),
      endpoint(receiptD, 'request', d.token),
    ]);
    assert.ok(
      requested.every((r) => r.code === 200),
      'Two related accounts request actual deletion',
    );
    assert.equal(
      (await endpoint(receiptA, 'request', a.token)).data.status,
      'processing',
      'Request retry is idempotent',
    );
    assert.equal(
      (await endpoint(receiptA, 'status')).data.status,
      'processing',
      'No premature deletion claim',
    );
    sql(
      `update private.account_deletion_receipts set created_at=now()-interval '31 days' where job_id in(select id from private.account_deletion_jobs where user_id='${a.id}')`,
    );
    assert.equal(
      (await endpoint(receiptA, 'status')).data.status,
      'processing',
      'Delayed cleanup never expires an accepted receipt',
    );
    assert.equal(
      (await c.admin.from('call_sessions').select('status').eq('id', started.data.id).single()).data
        ?.status,
      'ended',
    );
    assert.ok(!(await c.admin.functions.invoke('call-cleanup', { body: {} })).error);
    assert.equal(
      (await rooms.listRooms([room])).length,
      0,
      'Actual call room removed before Auth deletion',
    );
    assert.ok(
      (
        await a.client.rpc('save_profile', {
          display_name: 'Blocked write',
          username: 'blocked_delete_write',
        })
      ).error,
    );
    assert.equal(
      (await b.client.rpc('get_profile', { target: a.id })).data?.length,
      0,
      'Closing account is hidden',
    );
    assert.ok(
      (
        await b.client.rpc('start_call', {
          conversation: direct,
          media: 'voice',
          client_id: randomUUID(),
        })
      ).error,
      'Cannot start calls to closing account',
    );
    assert.ok((await b.client.rpc('claim_account_deletion')).error);
    const jobs = sql(
      `select id from private.account_deletion_jobs where user_id in('${a.id}','${d.id}') order by id`,
    ).split('\n');
    assert.equal(jobs.length, 2);
    assert.ok(
      (
        await b.client.rpc('finish_account_deletion', {
          job: jobs[0]!,
          lease: randomUUID(),
          completed: true,
        })
      ).error,
      'Clients cannot mark deletion complete',
    );
    await cleanup();
    assert.ok(
      (await c.admin.auth.admin.getUserById(a.id)).data.user,
      'Two-minute upload settlement gate preserves Auth initially',
    );
    // Advance only the reserved fixture jobs' clock, after asserting the real settlement gate.
    sql(
      `update private.account_deletion_jobs set created_at=now()-interval '3 minutes',next_attempt_at=now(),lease_id=null,lease_until=null where user_id in('${a.id}','${d.id}')`,
    );
    for (let round = 0; round < 8; round++) {
      await Promise.all([cleanup(), cleanup()]);
      const statuses = await Promise.all([
        endpoint(receiptA, 'status'),
        endpoint(receiptD, 'status'),
      ]);
      if (statuses.every((r) => r.data.status === 'deleted')) break;
      sql(
        `update private.account_deletion_jobs set next_attempt_at=now() where user_id in('${a.id}','${d.id}') and status<>'complete'`,
      );
    }
    assert.equal((await endpoint(receiptA, 'status')).data.status, 'deleted');
    assert.equal((await endpoint(receiptD, 'status')).data.status, 'deleted');
    assert.ok(
      (await c.admin.auth.admin.getUserById(a.id)).error,
      'Auth account is actually absent',
    );
    assert.ok((await c.admin.auth.admin.getUserById(d.id)).error);
    assert.equal(
      (await c.admin.from('profiles').select('id').in('id', [a.id, d.id])).data?.length,
      0,
    );
    assert.ok(
      (await c.admin.storage.from('chat-media').download(path)).error,
      'Owned file bytes actually removed',
    );
    assert.ok(
      (await c.admin.storage.from('avatars').download(avatarPath)).error,
      'Avatar bytes actually removed',
    );
    assert.ok(
      !(await c.admin.storage.from('chat-media').download(peerPath)).error,
      'Another account file is preserved',
    );
    const tombstone = await b.client
      .from('messages')
      .select('body,sender_id,deleted_at')
      .eq('id', text.data.id)
      .single();
    assert.equal(tombstone.data?.body, '');
    assert.equal(tombstone.data?.sender_id, null);
    assert.ok(tombstone.data?.deleted_at);
    assert.equal(
      (await b.client.from('messages').select('body').eq('id', peerText.data.id).single()).data
        ?.body,
      'Development peer content to preserve',
    );
    const surviving = await b.client.rpc('get_group', { conversation: group.data });
    assert.ok(!surviving.error);
    assert.equal(
      (
        await b.client
          .from('conversation_members')
          .select('role')
          .eq('conversation_id', group.data)
          .eq('user_id', b.id)
          .single()
      ).data?.role,
      'admin',
      'Surviving member is the administrator',
    );
    assert.equal(
      (await endpoint(receiptA, 'status')).data.status,
      'deleted',
      'Receipt works without an Auth session',
    );
    assert.ok(
      (
        await b.client.rpc('deletion_receipt_status', {
          receipt_hash: createHash('sha256').update(receiptA).digest('hex'),
        })
      ).error,
      'Raw receipt lookup is server-only',
    );
    const latePath = a.id + '/' + direct + '/' + randomUUID() + '/late-development-fixture';
    temporary.push({ bucket: 'chat-media', path: latePath });
    assert.ok(
      !(
        await c.admin.storage
          .from('chat-media')
          .upload(latePath, new TextEncoder().encode('Simulated interrupted uploader'), {
            contentType: 'text/plain',
          })
      ).error,
    );
    await cleanup();
    assert.ok(
      (await c.admin.storage.from('chat-media').download(latePath)).error,
      'Post-deletion sweep removes a simulated late upload',
    );
    assert.equal(sql("select active from cron.job where jobname='mnelo-account-cleanup'"), 'f');
    assert.equal(
      sql('select private.invoke_account_worker()'),
      '',
      'Missing cloud Vault configuration does not dispatch externally',
    );
    await c.admin.storage.from('chat-media').remove([peerPath]);
  },
);
