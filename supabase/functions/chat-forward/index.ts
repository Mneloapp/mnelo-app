import { z } from 'npm:zod@4.5.4';
import { authenticate } from '../_shared/auth.ts';
import { boundedBody, cors, response } from '../_shared/http.ts';
const schema = z
  .object({
    messageId: z.string().uuid(),
    conversationId: z.string().uuid(),
    clientId: z.string().uuid(),
  })
  .strict();
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response('INVALID', 405);
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    const { client, admin, user } = auth;
    let input;
    try {
      input = schema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))));
    } catch {
      return response('INVALID', 400);
    }
    const source = await client
      .from('messages')
      .select('id,kind,body,attachment_id,deleted_at')
      .eq('id', input.messageId)
      .single();
    if (source.error || source.data.deleted_at) return response('FORBIDDEN', 403);
    if (!source.data.attachment_id) {
      const result = await client.rpc('forward_structured_message', {
        source: input.messageId,
        destination: input.conversationId,
        client_id: input.clientId,
      });
      if (result.error) return response('FORBIDDEN', 403);
      return Response.json({ messageId: result.data.id }, { headers: cors });
    }
    const original = await client
      .from('message_attachments')
      .select('*')
      .eq('id', source.data.attachment_id)
      .eq('status', 'ready')
      .single();
    if (original.error) return response('FORBIDDEN', 403);
    const file = original.data;
    const reserved = await client.rpc('reserve_attachment', {
      conversation: input.conversationId,
      client_id: input.clientId,
      file_name: file.file_name,
      mime_type: file.mime_type,
      byte_size: file.byte_size,
      duration_seconds: file.duration_seconds,
    });
    if (reserved.error) return response('FORBIDDEN', 403);
    if (reserved.data.status !== 'ready') {
      const claimed = await admin.rpc('claim_attachment', {
        actor: user.id,
        attachment: reserved.data.id,
      });
      if (claimed.error) return response('CONFLICT', 409);
      const claim = claimed.data;
      let completed = false;
      try {
        const copy = await admin.storage
          .from('chat-media')
          .copy(file.object_path, claim.object_path);
        if (copy.error) return response('UNAVAILABLE', 503);
        const finish = await admin.rpc('complete_attachment', {
          actor: user.id,
          attachment: claim.id,
          claim: claim.processing_token,
          actual_mime: file.mime_type,
          actual_bytes: file.byte_size,
          actual_duration: file.duration_seconds,
        });
        if (finish.error) return response('UNAVAILABLE', 503);
        completed = true;
      } finally {
        if (!completed) {
          await admin.storage.from('chat-media').remove([claim.object_path]);
          await admin.rpc('release_attachment_claim', {
            actor: user.id,
            attachment: claim.id,
            claim: claim.processing_token,
          });
        }
      }
    }
    const result = await client.rpc('send_attachment_message', {
      attachment: reserved.data.id,
      caption: source.data.body,
      client_id: input.clientId,
    });
    if (result.error) return response('FORBIDDEN', 403);
    return Response.json({ messageId: result.data.id }, { headers: cors });
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
