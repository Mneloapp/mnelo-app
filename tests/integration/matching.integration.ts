import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localContext } from './local-context';
import { testUser } from './fixtures';
const c = localContext();
test(
  'explainable matching: evidence, ranking, privacy, expiry, blocks and Need/Offer direction',
  { timeout: 45000 },
  async () => {
    // These fixtures share connections/reviews; their cascaded cleanup is not independent.
    const users: Awaited<ReturnType<typeof testUser>>[] = [];
    for (const suffix of ['0801', '0802', '0803', '0804', '0805', '0806', '0807'])
      users.push(await testUser(c, suffix));
    const [a, b, other, hidden, blocked, irrelevant, extra] = users;
    assert.ok(a && b && other && hidden && blocked && irrelevant && extra);
    for (const [u, name, cap, area] of [
      [a, 'dev_match_a', '', 'Audit District'],
      [b, 'dev_match_b', 'Residential electrical installation', 'Audit District'],
      [other, 'dev_match_c', 'ელექტრიკოსი', 'Other District'],
      [hidden, 'dev_match_hidden', 'Electrician', 'Audit District'],
      [blocked, 'dev_match_blocked', 'Electrician', 'Audit District'],
      [irrelevant, 'dev_match_irrelevant', 'Plumbing', 'Audit District'],
      [extra, 'dev_match_extra', 'Electrician', 'Other District'],
    ] as const) {
      assert.ok(
        !(
          await u.client.rpc('save_profile', {
            display_name: name,
            username: name,
            capabilities: cap ? [cap] : [],
            coarse_area: area,
          })
        ).error,
      );
    }
    assert.ok(
      !(
        await b.client.rpc('update_profile_preferences', {
          languages: ['en', 'ka'],
          available_today: true,
        })
      ).error,
    );
    assert.ok(
      !(
        await hidden.client.rpc('update_privacy', {
          discoverability: 'nobody',
          phone_visibility: 'nobody',
          request_audience: 'relevant',
        })
      ).error,
    );
    assert.ok(!(await a.client.rpc('block_user', { target: blocked.id })).error);
    async function publish(
      user: typeof a,
      mode: 'need' | 'offer',
      rawText: string,
      answers: { area?: string; capability?: string } = {},
    ) {
      assert.ok(user);
      const res = await fetch(c.url + '/functions/v1/connect-intent', {
        method: 'POST',
        headers: {
          apikey: c.key,
          Authorization: 'Bearer ' + user.token,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'publish',
          clientId: crypto.randomUUID(),
          mode,
          rawText,
          timeZone: 'Asia/Tbilisi',
          answers,
        }),
      });
      assert.equal(res.status, 200);
      return (await res.json()).requestId as string;
    }
    const request = await publish(a, 'need', 'I need an electrician', { area: 'Audit District' });
    assert.deepEqual(
      (await a.client.rpc('get_profile', { target: b.id })).data,
      [],
      'Relevant-only stranger hidden before evidence',
    );
    assert.ok(
      (await b.client.rpc('find_matches', { request })).error,
      'Cannot evaluate another owner request',
    );
    let matches = await a.client.rpc('find_matches', { request });
    assert.ok(!matches.error, matches.error?.message);
    let cards = [...new Set(matches.data?.map((r) => r.candidate_id))];
    assert.equal(cards[0], b.id, 'Relevant area and explicit availability rank first');
    assert.equal(cards.length, 3, 'Return at most three actual candidates');
    for (const forbidden of [hidden.id, blocked.id, irrelevant.id, a.id])
      assert.ok(!cards.includes(forbidden));
    let bFacts = matches.data!.filter((r) => r.candidate_id === b.id);
    assert.equal(bFacts[0]?.rank_label, 'strong');
    assert.ok(
      bFacts.some(
        (r) => r.signal === 'capability' && r.fact === 'Residential electrical installation',
      ),
    );
    assert.ok(bFacts.some((r) => r.signal === 'area' && r.fact === 'Audit District'));
    assert.ok(bFacts.some((r) => r.signal === 'availability'));
    assert.ok(bFacts.some((r) => r.signal === 'language' && r.fact === 'en'));
    assert.ok(bFacts.every((r) => !r.profile.verified));
    assert.ok(!('score' in bFacts[0]!));
    assert.ok(
      (await a.client.from('matching_candidates').select('score').eq('request_id', request)).error,
      'Internal score column is not a client API',
    );
    assert.ok(
      (await a.client.rpc('get_profile', { target: b.id })).data?.length,
      'Actual result grants relevant profile access',
    );
    assert.ok(
      (
        await a.client.from('matching_candidates').insert({
          request_id: request,
          candidate_id: irrelevant.id,
          score: 999,
          rank_label: 'strong',
        })
      ).error,
      'Client cannot manufacture results',
    );
    const candidate = await a.client
      .from('matching_candidates')
      .select('id')
      .eq('request_id', request)
      .eq('candidate_id', b.id)
      .single();
    assert.ok(candidate.data);
    assert.ok(
      !(
        await b.client.rpc('update_profile_preferences', {
          languages: ['en', 'ka'],
          available_today: false,
        })
      ).error,
    );
    assert.deepEqual(
      (await a.client.from('matching_reasons').select('fact').eq('candidate_id', candidate.data.id))
        .data,
      [],
      'Changed facts invalidate stored explanation access',
    );
    assert.deepEqual(
      (await a.client.rpc('get_profile', { target: b.id })).data,
      [],
      'Expired result cannot keep a profile discoverable',
    );
    matches = await a.client.rpc('find_matches', { request });
    assert.ok(!matches.error);
    bFacts = matches.data!.filter((r) => r.candidate_id === b.id);
    assert.equal(bFacts[0]?.rank_label, 'good');
    assert.ok(!bFacts.some((r) => r.signal === 'availability'));
    await c.admin
      .from('matching_candidates')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', candidate.data.id);
    assert.deepEqual(
      (await a.client.rpc('get_profile', { target: b.id })).data,
      [],
      'TTL expiration is enforced on profile read',
    );
    assert.ok(!(await a.client.rpc('find_matches', { request })).error);
    assert.ok(!(await a.client.rpc('set_need_status', { request, status: 'paused' })).error);
    assert.deepEqual((await a.client.rpc('find_matches', { request })).data, []);
    assert.deepEqual((await a.client.rpc('get_profile', { target: b.id })).data, []);
    assert.ok(!(await a.client.rpc('set_need_status', { request, status: 'active' })).error);
    assert.ok(!(await a.client.rpc('find_matches', { request })).error);
    assert.ok(
      !(
        await b.client.rpc('update_privacy', {
          discoverability: 'nobody',
          phone_visibility: 'nobody',
          request_audience: 'relevant',
        })
      ).error,
    );
    assert.deepEqual((await a.client.rpc('get_profile', { target: b.id })).data, []);
    assert.ok(
      !(await a.client.rpc('find_matches', { request })).data?.some((r) => r.candidate_id === b.id),
    );
    assert.ok(
      !(
        await b.client.rpc('update_privacy', {
          discoverability: 'relevant',
          phone_visibility: 'nobody',
          request_audience: 'relevant',
        })
      ).error,
    );
    assert.ok(!(await a.client.rpc('find_matches', { request })).error);
    const context = await a.client.rpc('connection_state', {
      target: b.id,
      matching_request: request,
    });
    assert.ok(context.data?.[0]?.context);
    const outgoing = await a.client.rpc('send_connection_request', {
      target: b.id,
      context: context.data[0].context,
      matching_request: request,
    });
    assert.ok(outgoing.data);
    assert.ok(
      !(
        await b.client.rpc('respond_connection_request', {
          request: outgoing.data,
          action: 'accept',
        })
      ).error,
    );
    matches = await a.client.rpc('find_matches', { request });
    assert.ok(matches.data?.some((r) => r.candidate_id === b.id && r.signal === 'connection'));
    // Explicit service-side development review fixtures, never production/reputation awarded by the app.
    for (const [author, rating] of [
      [a, 5],
      [other, 4],
    ] as const) {
      const pair = [author.id, b.id].sort();
      const existing = await c.admin
        .from('connections')
        .select('id')
        .eq('user_low', pair[0]!)
        .eq('user_high', pair[1]!)
        .maybeSingle();
      let link = existing.data?.id;
      if (!link) {
        const row = await c.admin
          .from('connections')
          .insert({ user_low: pair[0]!, user_high: pair[1]! })
          .select('id')
          .single();
        assert.ok(row.data);
        link = row.data.id;
      }
      assert.ok(
        !(
          await c.admin
            .from('connections')
            .update({ interaction_type: 'service', completed_at: new Date().toISOString() })
            .eq('id', link)
        ).error,
      );
      assert.ok(
        !(
          await c.admin.from('connection_completions').upsert(
            [
              { connection_id: link, user_id: author.id },
              { connection_id: link, user_id: b.id },
            ],
            { onConflict: 'connection_id,user_id' },
          )
        ).error,
      );
      assert.ok(
        !(
          await c.admin.from('reviews').insert({
            connection_id: link,
            author_id: author.id,
            subject_id: b.id,
            rating,
            comment: 'Explicit local matching test fixture',
          })
        ).error,
      );
    }
    matches = await a.client.rpc('find_matches', { request });
    const review = matches.data?.find((r) => r.candidate_id === b.id && r.signal === 'review');
    assert.equal(review?.value_count, 2);
    assert.equal(review?.value_number, 4.5);
    assert.ok(!(await b.client.rpc('block_user', { target: a.id })).error);
    matches = await a.client.rpc('find_matches', { request });
    assert.ok(!matches.data?.some((r) => r.candidate_id === b.id));
    assert.deepEqual((await a.client.rpc('get_profile', { target: b.id })).data, []);
    const need = await publish(other, 'need', 'I need a bicycle online');
    const offer = await publish(a, 'offer', 'I offer a bicycle online');
    matches = await a.client.rpc('find_matches', { request: offer });
    assert.ok(!matches.error);
    assert.ok(
      matches.data?.some(
        (r) => r.candidate_id === other.id && r.signal === 'need' && r.fact === 'Bicycle',
      ),
    );
    assert.ok(
      !matches.data?.some((r) => r.signal === 'capability'),
      'An offer matches demand, not unrelated provider skills',
    );
    const summary = await a.client.rpc('get_profile_intents', { target: other.id });
    assert.ok(!summary.error);
    assert.ok(summary.data?.some((r) => r.id === need && r.capability === 'Bicycle'));
    assert.ok(summary.data?.every((r) => !('raw_text' in r) && !('detail_text' in r)));
    assert.deepEqual(
      (await a.client.from('matching_requests').select('raw_text').eq('id', need)).data,
      [],
    );
    assert.ok(
      !(
        await irrelevant.client.rpc('save_profile', {
          display_name: 'dev_match_irrelevant',
          username: 'dev_match_irrelevant',
          capabilities: ['Laptop'],
        })
      ).error,
    );
    const laptopNeed = await publish(a, 'need', 'I need a laptop online');
    assert.ok(
      !(await a.client.rpc('find_matches', { request: laptopNeed })).data?.some(
        (r) => r.candidate_id === irrelevant.id,
      ),
      'A product skill alone is not an active product offer',
    );
    await publish(irrelevant, 'offer', 'I offer a laptop online');
    assert.ok(
      (await a.client.rpc('find_matches', { request: laptopNeed })).data?.some(
        (r) => r.candidate_id === irrelevant.id && r.signal === 'offer',
      ),
    );
  },
);
