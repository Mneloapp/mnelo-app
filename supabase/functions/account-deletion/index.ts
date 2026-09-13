import { z } from 'npm:zod@4.5.4';
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { authenticate } from '../_shared/auth.ts';
import { boundedBody, cors, response } from '../_shared/http.ts';
const schema = z
  .object({ action: z.enum(['request', 'status']), receipt: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response('INVALID', 405);
  try {
    let input;
    try {
      input = schema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 1024))));
    } catch {
      return response('INVALID', 400);
    }
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.receipt)),
      ),
    )
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    if (input.action === 'request') {
      const auth = await authenticate(request);
      if (auth.error) return auth.error;
      let result = await auth.client.rpc('begin_account_deletion', { receipt_hash: digest });
      for (
        let attempt = 0;
        attempt < 2 && ['40P01', '40001'].includes(result.error?.code ?? '');
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 750));
        result = await auth.client.rpc('begin_account_deletion', { receipt_hash: digest });
      }
      if (result.error && ['40P01', '40001'].includes(result.error.code))
        return response('RETRY_REQUIRED', 503);
      if (result.error)
        return response(
          result.error.message === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FORBIDDEN',
          result.error.message === 'RATE_LIMITED' ? 429 : 403,
        );
      return Response.json(
        { status: 'processing' },
        { headers: { ...cors, 'Cache-Control': 'no-store' } },
      );
    }
    const url = Deno.env.get('SUPABASE_URL'),
      secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !secret) return response('UNAVAILABLE', 503);
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
      },
    });
    const result = await admin.rpc('deletion_receipt_status', { receipt_hash: digest });
    if (result.error) return response('UNAVAILABLE', 503);
    // This receipt exposes only completion state, never an account identifier or private data.
    return Response.json(
      { status: result.data ?? 'not_found' },
      { headers: { ...cors, 'Cache-Control': 'no-store' } },
    );
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
