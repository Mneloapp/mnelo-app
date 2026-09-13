import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'Connect: server interpretation, publication, provenance, ownership and state',
  { timeout: 30000 },
  async () => {
    const a = await testUser(c, '0701'),
      b = await testUser(c, '0702');
    for (const [u, name] of [
      [a, 'dev_connect_a'],
      [b, 'dev_connect_b'],
    ] as const)
      assert.ok(
        !(await u.client.rpc('save_profile', { display_name: name, username: name })).error,
      );
    const endpoint = c.url + '/functions/v1/connect-intent';
    const clientId = crypto.randomUUID();
    const rawText = '  I need an electrician in Vake today to install two ceiling lights.  ';
    const base = { clientId, rawText, mode: 'need', timeZone: 'Asia/Tbilisi', answers: {} };
    async function send(body: unknown, token = a.token) {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: c.key,
          Authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    }
    assert.equal((await send({ ...base, action: 'interpret' }, 'invalid')).status, 401);
    assert.equal(
      (await send({ ...base, action: 'interpret', actor: b.id })).status,
      400,
      'Unknown ownership parameter rejected',
    );
    const interpreted = await send({ ...base, action: 'interpret' });
    assert.equal(interpreted.status, 200);
    const result = (await interpreted.json()) as {
      interpretation: {
        rawText: string;
        category: string;
        capability: string;
        area: string;
        neededOn: string;
        clarification: string | null;
      };
    };
    assert.equal(result.interpretation.rawText, rawText);
    assert.equal(result.interpretation.capability, 'Electrical installation');
    assert.equal(result.interpretation.area, 'Vake');
    assert.equal(result.interpretation.clarification, null);
    const publish = await send({ ...base, action: 'publish' });
    assert.equal(publish.status, 200);
    const { requestId } = (await publish.json()) as { requestId: string };
    const repeat = await send({ ...base, action: 'publish' });
    assert.equal(repeat.status, 200);
    assert.equal((await repeat.json()).requestId, requestId);
    assert.equal(
      (await send({ ...base, rawText: 'I need plumbing in Vake', action: 'publish' })).status,
      409,
      'Key reuse cannot overwrite a different request',
    );
    const own = await a.client.from('matching_requests').select('*').eq('id', requestId).single();
    assert.ok(!own.error);
    assert.equal(own.data.raw_text, rawText);
    assert.equal(own.data.user_id, a.id);
    assert.equal(own.data.interpreter_version, 'rules-v1');
    assert.equal(own.data.needed_on, result.interpretation.neededOn);
    assert.equal(
      (await a.client.from('user_needs').select('id').eq('matching_request_id', requestId)).data
        ?.length,
      1,
      'Normalized Need row created',
    );
    assert.equal(
      (await a.client.from('user_offers').select('id').eq('matching_request_id', requestId)).data
        ?.length,
      0,
    );
    assert.deepEqual(
      (await b.client.from('matching_requests').select('*').eq('id', requestId)).data,
      [],
    );
    assert.ok(
      (await b.client.rpc('set_need_status', { request: requestId, status: 'paused' })).error,
      'Other user cannot alter lifecycle',
    );
    assert.ok(
      (
        await a.client.from('matching_requests').insert({
          user_id: b.id,
          raw_text: 'Forged',
          mode: 'need',
          intent_type: 'service',
          capability_term: 'Fake',
          match_key: 'forged',
        })
      ).error,
      'Direct client publication denied',
    );
    assert.ok(
      (
        await a.client.rpc('publish_matching_request', {
          actor: b.id,
          client_id: crypto.randomUUID(),
          fingerprint: 'a'.repeat(64),
          mode: 'need',
          raw_text: 'Forged',
          intent_type: 'service',
          capability_term: 'Fake',
          coarse_area: '',
          needed_on: '2026-09-07',
          detail_text: '',
          time_zone: 'UTC',
        })
      ).error,
      'Service publication procedure is not a client API',
    );
    const unknown = {
      ...base,
      clientId: crypto.randomUUID(),
      rawText: 'I need some help',
      answers: {},
    };
    assert.equal(
      (await send({ ...unknown, action: 'publish' })).status,
      400,
      'Incomplete interpretation cannot publish',
    );
    const first = await send({ ...unknown, action: 'interpret' });
    assert.equal((await first.json()).interpretation.clarification, 'capability');
    const capability = await send({
      ...unknown,
      action: 'interpret',
      answers: { capability: 'Plumbing' },
    });
    assert.equal((await capability.json()).interpretation.clarification, 'area');
    assert.equal(
      (
        await send({
          ...unknown,
          action: 'interpret',
          answers: { capability: 'Plumbing', area: '41.71,44.76' },
        })
      ).status,
      400,
      'Exact point is not coarse area',
    );
    const confirmed = await send({
      ...unknown,
      action: 'publish',
      answers: { capability: 'Plumbing', area: 'Saburtalo' },
    });
    assert.equal(confirmed.status, 200);
    const confirmedId = (await confirmed.json()).requestId as string;
    const provenance = await a.client
      .from('matching_requests')
      .select('raw_text,confirmed_capability,confirmed_area')
      .eq('id', confirmedId)
      .single();
    assert.equal(provenance.data?.raw_text, unknown.rawText);
    assert.equal(provenance.data?.confirmed_capability, 'Plumbing');
    assert.equal(provenance.data?.confirmed_area, 'Saburtalo');
    const offered = await send({
      ...base,
      clientId: crypto.randomUUID(),
      mode: 'offer',
      rawText: 'I offer photography online',
      action: 'publish',
    });
    assert.equal(offered.status, 200);
    const offerId = (await offered.json()).requestId as string;
    assert.equal(
      (await a.client.from('user_offers').select('id').eq('matching_request_id', offerId)).data
        ?.length,
      1,
    );
    for (const status of ['paused', 'active', 'completed'] as const) {
      assert.ok(!(await a.client.rpc('set_need_status', { request: requestId, status })).error);
      assert.equal(
        (await a.client.from('matching_requests').select('status').eq('id', requestId).single())
          .data?.status,
        status,
      );
    }
    const listed = await a.client.rpc('list_my_needs');
    assert.ok(!listed.error);
    assert.equal(listed.data?.length, 3);
    const tail = listed.data?.at(-1);
    assert.ok(tail);
    assert.deepEqual(
      (await a.client.rpc('list_my_needs', { before_time: tail.created_at, before_id: tail.id }))
        .data,
      [],
      'Cursor does not repeat rows',
    );
    assert.deepEqual((await b.client.rpc('list_my_needs')).data, []);
  },
);
