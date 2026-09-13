import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { localContext } from './local-context';
import { testUser } from './fixtures';
import { waitForPostgres } from './realtime';
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
async function edge(token: string, input: unknown) {
  const response = await fetch(c.url + '/functions/v1/calls', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      apikey: c.key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return { status: response.status, data: await response.json() };
}
async function socket(token: string) {
  const ws = new WebSocket(
    'ws://127.0.0.1:7880/rtc?protocol=15&sdk=js&version=2.22.3&auto_subscribe=1&access_token=' +
      encodeURIComponent(token),
  );
  const opened = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 5000);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      { once: true },
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        resolve(false);
      },
      { once: true },
    );
  });
  return { ws, opened };
}
test(
  'calls: actual room setup, participant-scoped tokens, consent, teardown, blocking and disabled room recreation',
  { timeout: 45000 },
  async (t) => {
    const a = await testUser(c, '1101'),
      b = await testUser(c, '1102'),
      outsider = await testUser(c, '1103');
    for (const [u, name] of [
      [a, 'dev_call_a'],
      [b, 'dev_call_b'],
      [outsider, 'dev_call_other'],
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
    const req = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: 'Development call test',
    });
    assert.ok(req.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: req.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const conversation = accepted.data;
    t.after(async () => {
      await a.client.removeAllChannels();
      await b.client.removeAllChannels();
      await outsider.client.removeAllChannels();
    });
    const callEvents: string[] = [];
    const topic = 'calls:' + a.id + ':' + randomUUID();
    const stream = a.client.channel(topic, { config: { private: true } }).on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_sessions',
        filter: 'caller_id=eq.' + a.id,
      },
      (payload) => callEvents.push(String(payload.new.id)),
    );
    await waitForPostgres(stream);
    const deniedStream = outsider.client.channel(topic, { config: { private: true } });
    const denial = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('TIMEOUT'), 8000);
      deniedStream.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });
    assert.equal(denial, 'CHANNEL_ERROR', 'Other account cannot join a private call topic');
    await outsider.client.removeChannel(deniedStream);

    const exact = await a.client.rpc('get_conversation', { conversation });
    assert.equal(exact.data?.[0]?.id, conversation);
    assert.equal(exact.data?.[0]?.kind, 'direct');
    assert.equal(exact.data?.[0]?.title, 'dev_call_b');
    assert.deepEqual((await outsider.client.rpc('get_conversation', { conversation })).data, []);
    assert.ok(
      (
        await outsider.client.rpc('observe_call_participants', {
          call: randomUUID(),
          identities: [outsider.id],
        })
      ).error,
    );

    assert.equal(
      (
        await edge(outsider.token, {
          action: 'start',
          conversation,
          media: 'voice',
          clientId: randomUUID(),
        })
      ).status,
      403,
    );
    const input = { action: 'start', conversation, media: 'voice', clientId: randomUUID() };
    const started = await edge(a.token, input);
    assert.equal(started.status, 200, 'LiveKit room setup succeeds');
    const call = started.data.id as string;
    assert.match(call, /^[0-9a-f-]{36}$/);
    const streamDeadline = Date.now() + 6000;
    while (!callEvents.includes(call) && Date.now() < streamDeadline)
      await new Promise((r) => setTimeout(r, 100));
    assert.ok(callEvents.includes(call), 'Actual authorized private call event received');

    assert.equal((await edge(a.token, input)).data.id, call, 'Retry returns same call');
    assert.equal(
      (await rooms.listRooms(['mnelo-call-' + call])).length,
      1,
      'Actual local room exists',
    );
    assert.equal(
      (await edge(a.token, { action: 'token', call })).status,
      403,
      'No publish permission before recipient consent',
    );
    assert.equal(
      (await edge(a.token, { action: 'accept', call })).status,
      403,
      'Caller cannot accept for recipient',
    );
    assert.equal(
      (await edge(outsider.token, { action: 'token', call })).status,
      403,
      'Outsider cannot obtain call token',
    );
    assert.equal(
      (await edge(outsider.token, { action: 'end', call })).status,
      403,
      'Outsider cannot end call',
    );
    assert.equal((await b.client.rpc('incoming_call')).data, call);
    assert.equal((await edge(b.token, { action: 'accept', call })).status, 200);
    const issued = await edge(a.token, { action: 'token', call });
    assert.equal(issued.status, 200);
    const peer = await edge(b.token, { action: 'token', call });
    assert.equal(peer.status, 200);
    const verifier = new TokenVerifier(values.LIVEKIT_API_KEY!, values.LIVEKIT_API_SECRET!);
    const grant = await verifier.verify(issued.data.token);
    assert.equal(grant.sub, a.id);
    assert.equal(grant.video?.room, 'mnelo-call-' + call);
    assert.equal(grant.video?.canPublishData, false);
    assert.deepEqual(grant.video?.canPublishSources, ['microphone']);
    assert.ok(
      Number(grant.exp) - Number(grant.nbf) <= 60 && Number(grant.exp) > Number(grant.nbf),
      'Short lived initial token',
    );
    assert.ok(
      !grant.video?.roomAdmin && !grant.video?.roomCreate && !grant.video?.roomRecord,
      'No admin/create/record authority',
    );
    const joined = await socket(issued.data.token);
    assert.ok(joined.opened, 'Actual authorized signaling handshake');
    const joinedPeer = await socket(peer.data.token);
    assert.ok(joinedPeer.opened);
    assert.equal((await edge(a.token, { action: 'end', call })).status, 200);
    joined.ws.close();
    joinedPeer.ws.close();
    assert.equal(
      (await rooms.listRooms(['mnelo-call-' + call])).length,
      0,
      'End deletes actual room',
    );
    assert.equal((await edge(a.token, { action: 'token', call })).status, 403);
    const reuse = await socket(issued.data.token);
    assert.equal(reuse.opened, false, 'Still-valid old token cannot auto-create deleted room');
    reuse.ws.close();
    const history = await a.client.from('messages').select('kind,body').eq('call_session_id', call);
    assert.equal(history.data?.length, 1);
    assert.equal(history.data?.[0]?.kind, 'call');
    const video = await edge(a.token, {
      action: 'start',
      conversation,
      media: 'video',
      clientId: randomUUID(),
    });
    assert.equal(video.status, 200);
    assert.equal((await edge(b.token, { action: 'accept', call: video.data.id })).status, 200);
    const videoToken = await edge(a.token, { action: 'token', call: video.data.id });
    assert.equal(videoToken.status, 200);
    const videoGrant = await verifier.verify(videoToken.data.token);
    assert.deepEqual(videoGrant.video?.canPublishSources, ['microphone', 'camera']);
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    assert.equal(
      (await edge(a.token, { action: 'token', call: video.data.id })).status,
      403,
      'Block denies new tokens immediately',
    );
    const cleanup = await c.admin.functions.invoke('call-cleanup', { body: {} });
    assert.ok(!cleanup.error, 'Authenticated cleanup worker actually runs');
    assert.equal(
      (await rooms.listRooms(['mnelo-call-' + video.data.id])).length,
      0,
      'Direct database block also deletes room through durable worker',
    );
    const blockedReuse = await socket(videoToken.data.token);
    assert.equal(blockedReuse.opened, false);
    blockedReuse.ws.close();
    assert.ok(!(await b.client.rpc('unblock_user', { target: a.id })).error);
    const declined = await edge(a.token, {
      action: 'start',
      conversation,
      media: 'voice',
      clientId: randomUUID(),
    });
    assert.equal(declined.status, 200);
    assert.equal((await edge(b.token, { action: 'decline', call: declined.data.id })).status, 200);
    assert.equal((await rooms.listRooms(['mnelo-call-' + declined.data.id])).length, 0);
    assert.ok(
      (await outsider.client.rpc('mark_call_room_ready', { call })).error,
      'Client cannot assert room readiness',
    );
    assert.ok(
      (await outsider.client.rpc('claim_call_cleanup')).error,
      'Client cannot administer other rooms',
    );
    const forbiddenWorker = await fetch(c.url + '/functions/v1/call-cleanup', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + outsider.token },
    });
    assert.equal(forbiddenWorker.status, 401);
  },
);
