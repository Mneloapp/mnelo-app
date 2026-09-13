import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'reputation: mutual completion, relevant purpose, immutable eligible reviews and scoped verification',
  { timeout: 30000 },
  async () => {
    const a = await testUser(c, '0911'),
      b = await testUser(c, '0912'),
      observer = await testUser(c, '0913');
    for (const [u, username] of [
      [a, 'dev_review_a'],
      [b, 'dev_review_b'],
      [observer, 'dev_review_observer'],
    ] as const) {
      assert.ok(
        !(
          await u.client.rpc('save_profile', {
            display_name: username,
            username,
            coarse_area: 'Review District',
            capabilities: u === b ? ['Electrical installation'] : [],
          })
        ).error,
      );
      assert.ok(
        !(
          await u.client.rpc('update_privacy', {
            discoverability: 'everyone',
            request_audience: 'everyone',
            phone_visibility: 'nobody',
          })
        ).error,
      );
    }
    const published = await fetch(c.url + '/functions/v1/connect-intent', {
      method: 'POST',
      headers: {
        apikey: c.key,
        Authorization: 'Bearer ' + a.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'publish',
        clientId: randomUUID(),
        mode: 'need',
        rawText: 'I need an electrician',
        answers: { area: 'Review District' },
        timeZone: 'Asia/Tbilisi',
      }),
    });
    assert.equal(published.status, 200);
    const request = (await published.json()).requestId as string;
    assert.ok(!(await a.client.rpc('find_matches', { request })).error);
    const state = await a.client.rpc('connection_state', {
      target: b.id,
      matching_request: request,
    });
    assert.ok(state.data?.[0]?.context);
    const sent = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: state.data[0].context,
      matching_request: request,
    });
    assert.ok(sent.data);
    const accepted = await b.client.rpc('respond_connection_request', {
      request: sent.data,
      action: 'accept',
    });
    assert.ok(accepted.data);
    const chat = accepted.data;
    let details = await a.client.rpc('connection_details', { conversation: chat });
    assert.ok(!details.error && details.data?.[0]);
    const link = details.data[0].id;
    assert.equal(details.data[0].interaction_type, 'service');
    assert.equal(details.data[0].completed_at, null);
    assert.ok(
      (await observer.client.rpc('connection_details', { conversation: chat })).error,
      'Connection context is private',
    );
    assert.ok(
      (await a.client.rpc('submit_connection_review', { connection: link, rating: 5 })).error,
      'Uncompleted review denied',
    );
    assert.ok(
      (await a.client.from('connection_completions').insert({ connection_id: link, user_id: b.id }))
        .error,
      'Cannot forge other person’s completion',
    );
    assert.ok(
      (await observer.client.rpc('confirm_connection_completion', { connection: link })).error,
      'Outsider completion denied',
    );
    assert.ok(!(await a.client.rpc('confirm_connection_completion', { connection: link })).error);
    details = await a.client.rpc('connection_details', { conversation: chat });
    assert.equal(details.data?.[0]?.confirmed_by_me, true);
    assert.equal(details.data?.[0]?.confirmed_by_peer, false);
    assert.equal(details.data?.[0]?.completed_at, null);
    assert.ok(
      (await a.client.rpc('submit_connection_review', { connection: link, rating: 5 })).error,
      'One confirmation cannot unlock review',
    );
    // Deliberate concurrent responses exercise the pair lock, not independent fixture cleanup.
    const completions = await Promise.all([
      a.client.rpc('confirm_connection_completion', { connection: link }),
      b.client.rpc('confirm_connection_completion', { connection: link }),
    ]);
    assert.ok(completions.every((r) => !r.error));
    details = await a.client.rpc('connection_details', { conversation: chat });
    assert.ok(details.data?.[0]?.completed_at);
    assert.equal(details.data?.[0]?.confirmed_by_peer, true);
    const history = await a.client.rpc('completed_connections');
    assert.equal(history.data?.length, 1);
    assert.equal(history.data?.[0]?.id, link);
    assert.deepEqual((await observer.client.rpc('completed_connections')).data, []);
    for (const rating of [0, 6])
      assert.ok(
        (await a.client.rpc('submit_connection_review', { connection: link, rating })).error,
        'Rating bounds',
      );
    const input = {
      connection: link,
      rating: 4,
      comment: 'Development review: work completed as agreed.',
    };
    const review = await a.client.rpc('submit_connection_review', input);
    assert.ok(!review.error && review.data, 'Eligible review created');
    assert.equal(
      (await a.client.rpc('submit_connection_review', input)).data,
      review.data,
      'Exact retry idempotent',
    );
    assert.ok(
      (await a.client.rpc('submit_connection_review', { ...input, rating: 5 })).error,
      'Review cannot be rewritten',
    );
    assert.ok(
      (await a.client.from('reviews').update({ rating: 5 }).eq('id', review.data)).error,
      'Client direct edit denied',
    );
    assert.ok(
      (
        await b.client
          .from('reviews')
          .insert({ connection_id: link, author_id: a.id, subject_id: b.id, rating: 5 })
      ).error,
      'Self-rating/spoofed reviewer denied',
    );
    assert.ok(
      (await observer.client.rpc('submit_connection_review', input)).error,
      'Only participant can review',
    );
    assert.ok(
      (await observer.client.from('reviews').select('*')).error,
      'Raw reviewer/connection identifiers are not exposed',
    );
    const visible = await observer.client.rpc('profile_reviews', { target: b.id });
    assert.equal(visible.data?.length, 1);
    assert.ok(visible.data?.[0]);
    assert.deepEqual(Object.keys(visible.data[0]).sort(), [
      'comment',
      'created_at',
      'id',
      'interaction_type',
      'own',
      'rating',
    ]);
    assert.equal(visible.data[0].rating, 4);
    assert.equal(visible.data[0].own, false);
    assert.equal((await a.client.rpc('profile_reviews', { target: b.id })).data?.[0]?.own, true);
    let profile = await observer.client.rpc('get_profile', { target: b.id });
    assert.equal(profile.data?.[0]?.review_count, 1);
    assert.equal(profile.data?.[0]?.average_rating, 4);
    assert.ok(
      !(await c.admin.from('reviews').update({ status: 'hidden' }).eq('id', review.data)).error,
      'Privileged local moderation fixture',
    );
    assert.deepEqual((await observer.client.rpc('profile_reviews', { target: b.id })).data, []);
    profile = await observer.client.rpc('get_profile', { target: b.id });
    assert.equal(profile.data?.[0]?.review_count, 0, 'Hidden review excluded from summary');
    assert.ok(
      !(await c.admin.from('reviews').update({ status: 'published' }).eq('id', review.data)).error,
    );
    const social = await a.client.rpc('send_connection_request', {
      target: observer.id,
      context: 'Development social connection',
    });
    assert.ok(social.data);
    const socialChat = await observer.client.rpc('respond_connection_request', {
      request: social.data,
      action: 'accept',
    });
    assert.ok(socialChat.data);
    const socialDetails = (
      await a.client.rpc('connection_details', { conversation: socialChat.data })
    ).data?.[0];
    assert.ok(socialDetails);
    assert.equal(socialDetails.interaction_type, 'social');
    assert.ok(
      (await a.client.rpc('confirm_connection_completion', { connection: socialDetails.id })).error,
      'Friendship needs no completion',
    );
    assert.ok(
      (await a.client.rpc('submit_connection_review', { connection: socialDetails.id, rating: 5 }))
        .error,
      'No social rating',
    );
    assert.ok(
      (
        await b.client.from('verification_status').insert({
          user_id: b.id,
          verification_type: 'identity',
          verified_at: new Date().toISOString(),
        })
      ).error,
      'Self-verification denied',
    );
    assert.ok(
      !(
        await c.admin.from('verification_status').insert([
          {
            user_id: b.id,
            verification_type: 'identity',
            verified_at: '2024-01-01T00:00:00Z',
            expires_at: '2025-01-01T00:00:00Z',
          },
          { user_id: b.id, verification_type: 'business', verified_at: '2099-01-01T00:00:00Z' },
          {
            user_id: b.id,
            verification_type: 'professional',
            verified_at: new Date(Date.now() - 1000).toISOString(),
            expires_at: new Date(Date.now() + 60000).toISOString(),
          },
        ])
      ).error,
      'Explicit temporary local verification fixtures',
    );
    const scopes = await observer.client.rpc('profile_verifications', { target: b.id });
    assert.deepEqual(
      scopes.data?.map((v) => v.verification_type),
      ['professional'],
      'Only actually current scope returned',
    );
    assert.ok(
      !(await c.admin.from('verification_status').delete().eq('user_id', b.id)).error,
      'Remove temporary verification fixture',
    );
    assert.equal(
      (await observer.client.rpc('get_profile', { target: b.id })).data?.[0]?.verified,
      false,
    );
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    assert.ok(
      (await a.client.rpc('submit_connection_review', input)).error,
      'Block supersedes retry',
    );
    assert.ok(
      (await a.client.rpc('profile_reviews', { target: b.id })).error,
      'Block denies reputation read',
    );
    assert.equal(
      (await observer.client.rpc('profile_reviews', { target: b.id })).data?.length,
      1,
      'Blocking does not erase another person’s already published review',
    );
  },
);
