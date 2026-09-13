import { z } from 'npm:zod@4.5.4';
import { authenticate } from '../_shared/auth.ts';
import { boundedBody, cors, response } from '../_shared/http.ts';
import { rulesInterpreter, validCoarseArea, type IntentInterpreter } from '../_shared/intent.ts';
const inputSchema = z
  .object({
    action: z.enum(['interpret', 'publish']),
    clientId: z.uuid(),
    mode: z.enum(['need', 'offer']),
    rawText: z
      .string()
      .min(3)
      .max(2000)
      .refine(
        (value) => value.trim().length >= 3 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value),
      ),
    timeZone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    answers: z
      .object({
        capability: z.string().trim().min(1).max(240).optional(),
        area: z.string().trim().min(1).max(120).refine(validCoarseArea).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
// A future remote interpreter must enforce a deadline, validate this same result contract,
// and fall back to the deterministic provider. Only server modules can select that provider.
const interpreter: IntentInterpreter = rulesInterpreter;
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response('INVALID', 405);
  try {
    const session = await authenticate(request);
    if (session.error) return session.error;
    const limited = await session.client.rpc('consume_connect_attempt');
    if (limited.error)
      return response(
        limited.error.message === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FORBIDDEN',
        limited.error.message === 'RATE_LIMITED' ? 429 : 403,
      );
    let input;
    try {
      input = inputSchema.parse(
        JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000))),
      );
    } catch {
      return response('INVALID', 400);
    }
    const result = await interpreter.interpret(input, new Date());
    const interpretation = {
      ...result,
      clientId: input.clientId,
      timeZone: input.timeZone,
      answers: input.answers,
    };
    if (input.action === 'interpret') return Response.json({ interpretation }, { headers: cors });
    if (result.clarification) return response('INVALID', 400);
    const fingerprintInput = JSON.stringify([
      input.mode,
      input.rawText,
      input.timeZone,
      input.answers.capability ?? '',
      input.answers.area ?? '',
    ]);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(fingerprintInput),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const saved = await session.admin.rpc('publish_matching_request', {
      actor: session.user.id,
      client_id: input.clientId,
      fingerprint,
      mode: input.mode,
      raw_text: input.rawText,
      intent_type: result.category,
      capability_term: result.capability,
      coarse_area: result.area,
      needed_on: result.neededOn,
      detail_text: result.details,
      time_zone: input.timeZone,
      confirmed_capability: input.answers.capability ?? null,
      confirmed_area: input.answers.area ?? null,
    });
    if (saved.error)
      return response(
        saved.error.message === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : saved.error.code === '23505'
            ? 'CONFLICT'
            : 'INVALID',
        saved.error.message === 'RATE_LIMITED' ? 429 : saved.error.code === '23505' ? 409 : 400,
      );
    return Response.json({ requestId: saved.data.id }, { headers: cors });
  } catch {
    return response('UNAVAILABLE', 503);
  }
});
