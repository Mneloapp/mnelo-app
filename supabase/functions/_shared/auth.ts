import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { response } from './http.ts';
export async function authenticate(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096)
    return { error: response('UNAUTHORIZED', 401) };
  const url = Deno.env.get('SUPABASE_URL'),
    key = Deno.env.get('SUPABASE_ANON_KEY'),
    secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !secret) return { error: response('UNAVAILABLE', 503) };
  const base = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  };
  const client = createClient(url, key, {
    ...base,
    global: { ...base.global, headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) return { error: response('UNAUTHORIZED', 401) };
  const active = await client.rpc('session_active');
  if (active.error) return { error: response('UNAVAILABLE', 503) };
  if (!active.data) return { error: response('UNAUTHORIZED', 401) };
  return { client, admin: createClient(url, secret, base), user: data.user };
}
