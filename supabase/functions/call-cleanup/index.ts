import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { livekitConfiguration, callRoom, closeCallRoom, roomMissing } from '../_shared/livekit.ts';
import { response } from '../_shared/http.ts';
Deno.serve(async (request) => {
  if (request.method !== 'POST') return response('INVALID', 405);
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supplied = request.headers.get('Authorization');
  if (!secret || !supplied || supplied.length > 4096) return response('UNAUTHORIZED', 401);
  const hash = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [expected, actual] = await Promise.all([hash('Bearer ' + secret), hash(supplied)]);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ actual[i]!;
  if (diff) return response('UNAUTHORIZED', 401);
  try {
    const config = livekitConfiguration(),
      url = Deno.env.get('SUPABASE_URL');
    if (!url) return response('UNAVAILABLE', 503);
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    let failed = false;
    const active = await admin.rpc('active_call_rooms');
    if (active.error) failed = true;
    // Presence comes from LiveKit, not a mobile boolean or a JS background timer.
    // One failed room lookup must not block terminal-call eviction.
    for (let offset = 0; offset < (active.data?.length ?? 0); offset += 5) {
      const outcomes = await Promise.allSettled(
        active.data.slice(offset, offset + 5).map(async (item: { id: string }) => {
          let identities: string[];
          try {
            const people = await config.rooms.listParticipants(callRoom(item.id));
            identities = people.map((p) => p.identity).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
          } catch (error) {
            if (!roomMissing(error)) throw error;
            identities = [];
          }
          const observed = await admin.rpc('observe_call_participants', {
            call: item.id,
            identities,
          });
          if (observed.error) throw new Error('CALL_QUEUE');
        }),
      );
      if (outcomes.some((result) => result.status === 'rejected')) failed = true;
    }
    const work = await admin.rpc('claim_call_cleanup');
    if (work.error) throw new Error('CALL_QUEUE');
    let completed = 0;
    for (let offset = 0; offset < (work.data?.length ?? 0); offset += 5) {
      const outcomes = await Promise.allSettled(
        work.data
          .slice(offset, offset + 5)
          .map(
            async (item: {
              id: string;
              call_id: string;
              caller_id: string | null;
              recipient_id: string | null;
              lease: string;
            }) => {
              await closeCallRoom(config, item.call_id, [item.caller_id, item.recipient_id]);
              const done = await admin.rpc('finish_call_cleanup', {
                work: item.id,
                lease: item.lease,
              });
              if (done.error) throw new Error('CALL_QUEUE');
              completed++;
            },
          ),
      );
      if (outcomes.some((result) => result.status === 'rejected')) failed = true;
    }
    return failed ? response('UNAVAILABLE', 503) : Response.json({ processed: completed });
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
