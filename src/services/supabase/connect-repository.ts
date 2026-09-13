import { z } from 'zod';
import * as Crypto from 'expo-crypto';
import { supabaseClient } from './client';
import { edgeRequest } from './edge-request';
import { RepositoryError, type MneloRepository } from '../repository';
import { repositoryError } from './errors';
import type { Interpretation, NeedMode, NeedOffer } from '@/types/domain';
import type { Database } from './database.types';
import { decodeCursor } from '@/features/chats/cursor';
const interpretationSchema = z.object({
  category: z.enum(['service', 'professional', 'social', 'capability', 'opportunity', 'product']),
  capability: z.string().max(240),
  area: z.string().max(120),
  when: z.string(),
  neededOn: z.string().nullable(),
  details: z.string().max(2000),
  rawText: z.string().max(2000),
  clarification: z.enum(['capability', 'area']).nullable(),
  version: z.string(),
  clientId: z.uuid(),
  timeZone: z.string(),
  answers: z
    .object({ capability: z.string().optional(), area: z.string().optional() })
    .transform((v) => ({
      ...(v.capability ? { capability: v.capability } : {}),
      ...(v.area ? { area: v.area } : {}),
    })),
});
function mapNeed(row: Database['public']['Tables']['matching_requests']['Row']): NeedOffer {
  return {
    id: row.id,
    ownerId: row.user_id,
    mode: row.mode as NeedMode,
    rawText: row.raw_text,
    status: row.status === 'completed' ? 'closed' : (row.status as 'active' | 'paused'),
    createdAt: row.created_at,
    interpretation: {
      category: row.intent_type as Interpretation['category'],
      capability: row.capability_term,
      area: row.coarse_area,
      when: row.needed_on ?? '',
      neededOn: row.needed_on,
      details: row.detail_text,
      rawText: row.raw_text,
      clarification: null,
      version: row.interpreter_version,
      timeZone: row.time_zone,
    },
  };
}
async function request(
  action: 'interpret' | 'publish',
  mode: NeedMode,
  interpretation: Pick<Interpretation, 'rawText' | 'clientId' | 'timeZone' | 'answers'>,
) {
  const body = new TextEncoder().encode(
    JSON.stringify({
      action,
      mode,
      rawText: interpretation.rawText,
      clientId: interpretation.clientId,
      timeZone: interpretation.timeZone,
      answers: interpretation.answers ?? {},
    }),
  );
  return edgeRequest('connect-intent', body.buffer, { 'Content-Type': 'application/json' });
}
export function connectRepository(): Pick<
  MneloRepository,
  'interpret' | 'clarify' | 'saveNeed' | 'needs' | 'need' | 'setNeedStatus'
> {
  const client = supabaseClient();
  return {
    async interpret(rawText, mode) {
      const data = await request('interpret', mode, {
        rawText,
        clientId: Crypto.randomUUID(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return z.object({ interpretation: interpretationSchema }).parse(data).interpretation;
    },
    async clarify(mode, input, answer) {
      if (!input.clarification) throw new RepositoryError('INVALID');
      const next = { ...input, answers: { ...input.answers, [input.clarification]: answer } };
      const data = await request('interpret', mode, next);
      return z.object({ interpretation: interpretationSchema }).parse(data).interpretation;
    },
    async saveNeed(mode, input) {
      const data = z.object({ requestId: z.uuid() }).parse(await request('publish', mode, input));
      const row = await client
        .from('matching_requests')
        .select('*')
        .eq('id', data.requestId)
        .single();
      if (row.error) throw repositoryError(row.error);
      return mapNeed(row.data);
    },
    async needs(cursor) {
      const { data, error } = await client.rpc('list_my_needs', decodeCursor(cursor));
      if (error) throw repositoryError(error);
      return (data ?? []).map(mapNeed);
    },
    async need(id) {
      const { data, error } = await client
        .from('matching_requests')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw repositoryError(error);
      return mapNeed(data);
    },
    async setNeedStatus(id, status) {
      const { error } = await client.rpc('set_need_status', {
        request: id,
        status: status === 'closed' ? 'completed' : status,
      });
      if (error) throw repositoryError(error);
    },
  };
}
