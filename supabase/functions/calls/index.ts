import { z } from 'npm:zod@4.5.4';
import { authenticate } from '../_shared/auth.ts';
import { boundedBody, cors, response } from '../_shared/http.ts';
import { livekitConfiguration, callRoom, callToken, closeCallRoom } from '../_shared/livekit.ts';
const schema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start'),
      conversation: z.uuid(),
      media: z.enum(['voice', 'video']),
      clientId: z.uuid(),
    })
    .strict(),
  z.object({ action: z.literal('token'), call: z.uuid() }).strict(),
  z.object({ action: z.enum(['accept', 'decline', 'end', 'failed']), call: z.uuid() }).strict(),
]);
const failure = (error: { code?: string; message?: string }) =>
  response(
    error.message === 'RATE_LIMITED'
      ? 'RATE_LIMITED'
      : error.message === 'EXPIRED'
        ? 'EXPIRED'
        : error.code === '23505'
          ? 'CONFLICT'
          : 'FORBIDDEN',
    error.message === 'RATE_LIMITED' ? 429 : error.code === '23505' ? 409 : 403,
  );
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response('INVALID', 405);
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    let input;
    try {
      input = schema.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))));
    } catch {
      return response('INVALID', 400);
    }
    const config = livekitConfiguration();
    if (input.action === 'start') {
      const started = await auth.client.rpc('start_call', {
        conversation: input.conversation,
        media: input.media,
        client_id: input.clientId,
      });
      if (started.error) return failure(started.error);
      const id = started.data as string;
      const current = await auth.client.rpc('get_call', { call: id });
      if (current.error || !current.data?.[0]) return response('FORBIDDEN', 403);
      // An idempotent retry of a finished call never recreates its old room.
      if (current.data[0].status === 'ringing') {
        try {
          await config.rooms.createRoom({
            name: callRoom(id),
            emptyTimeout: 120,
            departureTimeout: 20,
            maxParticipants: 2,
          });
          const ready = await auth.admin.rpc('mark_call_room_ready', { call: id });
          if (ready.error || !ready.data) {
            await closeCallRoom(config, id, []);
            return response('EXPIRED', 409);
          }
        } catch {
          await auth.client.rpc('respond_call', { call: id, action: 'failed' });
          throw new Error('CALL_SETUP');
        }
      }
      return Response.json({ id }, { headers: cors });
    }
    if (input.action === 'token') {
      const context = await auth.client.rpc('call_token_context', { call: input.call });
      if (context.error) return failure(context.error);
      const grant = context.data?.[0];
      if (!grant) return response('FORBIDDEN', 403);
      const token = await callToken(config, grant.id, grant.actor_id, grant.media);
      const recheck = await auth.client.rpc('get_call', { call: input.call });
      if (recheck.error || !recheck.data?.[0]?.can_join) return response('FORBIDDEN', 403);
      return Response.json(
        { token, url: config.publicUrl },
        { headers: { ...cors, 'Cache-Control': 'no-store' } },
      );
    }
    const changed = await auth.client.rpc('respond_call', {
      call: input.call,
      action: input.action,
    });
    if (changed.error) return failure(changed.error);
    if (input.action !== 'accept') {
      const record = await auth.admin
        .from('call_sessions')
        .select('caller_id,recipient_id')
        .eq('id', input.call)
        .single();
      // Queue remains durable if this best-effort immediate cleanup fails.
      if (record.data)
        try {
          await closeCallRoom(config, input.call, [
            record.data.caller_id,
            record.data.recipient_id,
          ]);
        } catch {
          /* The cleanup worker retries; never return room success here. */
        }
    }
    return Response.json({ status: 'recorded' }, { headers: cors });
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
