import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import jpeg from 'npm:jpeg-js@0.4.4';
import { boundedBody, cors, response } from '../_shared/http.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response('INVALID', 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096)
    return response('UNAUTHORIZED', 401);
  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
  const privilegedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !privilegedKey) return response('UNAVAILABLE', 503);
  const client = createClient(url, publicKey, {
    global: {
      headers: { Authorization: authorization },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    // Verify with Auth; never use an unverified JWT payload or body-supplied user id.
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(authorization.slice(7));
    if (authError || !user) return response('UNAUTHORIZED', 401);
    const reserved = await client.rpc('reserve_avatar');
    if (reserved.error)
      return response(
        reserved.error.message === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FORBIDDEN',
        reserved.error.message === 'RATE_LIMITED' ? 429 : 403,
      );
    if (request.headers.get('content-type') !== 'image/jpeg') return response('INVALID', 415);
    let pixels;
    try {
      const bytes = await boundedBody(request, 2 * 1024 * 1024);
      pixels = jpeg.decode(bytes, {
        useTArray: true,
        tolerantDecoding: false,
        maxResolutionInMP: 1.1,
        maxMemoryUsageInMB: 32,
      });
      if (pixels.width > 1024 || pixels.height > 1024) return response('INVALID', 413);
    } catch {
      return response('INVALID', 400);
    }
    // Encode only decoded pixels: drop EXIF/GPS/comments and any appended payload.
    const clean = jpeg.encode(
      { width: pixels.width, height: pixels.height, data: pixels.data },
      80,
    ).data;
    const admin = createClient(url, privilegedKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    });
    const path = `${user.id}/${reserved.data}.jpg`;
    const uploaded = await admin.storage
      .from('avatars')
      .upload(path, clean, { contentType: 'image/jpeg', cacheControl: '60', upsert: false });
    if (uploaded.error) return response('UNAVAILABLE', 503);
    const completed = await admin.rpc('complete_avatar', {
      actor: user.id,
      reservation: reserved.data,
    });
    if (completed.error) {
      await admin.storage.from('avatars').remove([path]);
      return response('UNAVAILABLE', 503);
    }
    if (completed.data) await admin.storage.from('avatars').remove([completed.data]);
    return Response.json({ profileId: user.id }, { headers: cors });
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
