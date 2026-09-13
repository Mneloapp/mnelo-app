import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { dispatchPush, expoPushProvider, type PushWork } from '../_shared/push.ts';
import { response } from '../_shared/http.ts';
// Only a server scheduler may invoke this endpoint. There is no development mock in this handler.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return response('INVALID', 405);
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!secret || !authorization || authorization.length > 4096)
    return response('UNAUTHORIZED', 401);
  const digest = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [expected, supplied] = await Promise.all([
    digest('Bearer ' + secret),
    digest(authorization),
  ]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i]! ^ supplied[i]!;
  if (difference !== 0) return response('UNAUTHORIZED', 401);
  const url = Deno.env.get('SUPABASE_URL'),
    token = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (!url || !token) return response('UNAVAILABLE', 503);
  try {
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    const result = await dispatchPush(
      {
        async claim() {
          const { data, error } = await admin.rpc('claim_push_work');
          if (error) throw new Error('PUSH_QUEUE');
          return data as PushWork[];
        },
        async payload(delivery, lease) {
          const { data, error } = await admin.rpc('push_payload', { delivery, lease });
          if (error) throw new Error('PUSH_QUEUE');
          return data;
        },
        async finish(work, result) {
          const { error } = await admin.rpc('finish_push_work', {
            delivery: work.delivery_id,
            lease: work.lease,
            outcome: result.outcome,
            ticket: result.ticket ?? null,
          });
          if (error) throw new Error('PUSH_QUEUE');
        },
      },
      expoPushProvider(token),
    );
    return Response.json(result);
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
