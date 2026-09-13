import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { boundedBody, cors, response } from '../_shared/http.ts';
import { validateMedia } from '../_shared/media.ts';
const headers = {
  ...cors,
  'Access-Control-Allow-Headers':
    cors['Access-Control-Allow-Headers'] + ', x-conversation-id, x-upload-id, x-file-name',
};
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return response('INVALID', 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || authorization.length > 4096)
    return response('UNAUTHORIZED', 401);
  const url = Deno.env.get('SUPABASE_URL'),
    key = Deno.env.get('SUPABASE_ANON_KEY'),
    secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !secret) return response('UNAVAILABLE', 503);
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
    },
  };
  const client = createClient(url, key, {
    ...options,
    global: { ...options.global, headers: { Authorization: authorization } },
  });
  try {
    const auth = await client.auth.getUser(authorization.slice(7));
    if (auth.error || !auth.data.user) return response('UNAUTHORIZED', 401);
    const actor = auth.data.user.id;
    const conversation = request.headers.get('x-conversation-id'),
      uploadId = request.headers.get('x-upload-id');
    const mime = request.headers.get('content-type') ?? '';
    let name = '';
    try {
      name = decodeURIComponent(request.headers.get('x-file-name') ?? '');
    } catch {
      return response('INVALID', 400);
    }
    if (!conversation || !uploadId || !name) return response('INVALID', 400);
    // Reserve before image/audio parsing so invalid bodies consume a server-authoritative attempt.
    const reserved = await client.rpc('reserve_attachment', {
      conversation,
      client_id: uploadId,
      file_name: name,
      mime_type: mime,
      byte_size: Math.max(1, Number(request.headers.get('content-length')) || 1),
    });
    if (reserved.error)
      return response(
        reserved.error.message === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FORBIDDEN',
        reserved.error.message === 'RATE_LIMITED' ? 429 : 403,
      );
    if (reserved.data.status === 'ready')
      return Response.json({ attachmentId: reserved.data.id }, { headers });
    if (reserved.data.status !== 'pending') return response('CONFLICT', 409);
    const admin = createClient(url, secret, options);
    const claimed = await admin.rpc('claim_attachment', { actor, attachment: reserved.data.id });
    if (claimed.error) return response('CONFLICT', 409);
    const claim = claimed.data;
    let completed = false;
    try {
      let media;
      try {
        media = await validateMedia(await boundedBody(request, 20 * 1024 * 1024), mime);
      } catch {
        return response('INVALID', 400);
      }
      const uploaded = await admin.storage
        .from('chat-media')
        .upload(claim.object_path, media.bytes, {
          contentType: media.mime,
          cacheControl: '60',
          upsert: false,
        });
      if (uploaded.error) return response('UNAVAILABLE', 503);
      const result = await admin.rpc('complete_attachment', {
        actor,
        attachment: claim.id,
        claim: claim.processing_token,
        actual_mime: media.mime,
        actual_bytes: media.bytes.byteLength,
        actual_duration: media.duration,
      });
      if (result.error) return response('UNAVAILABLE', 503);
      completed = true;
    } finally {
      if (!completed) {
        await admin.storage.from('chat-media').remove([claim.object_path]);
        await admin.rpc('release_attachment_claim', {
          actor,
          attachment: claim.id,
          claim: claim.processing_token,
        });
      }
    }
    return Response.json({ attachmentId: reserved.data.id }, { headers });
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
