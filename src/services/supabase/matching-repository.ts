import { z } from 'zod';
import type { MneloRepository } from '../repository';
import { RepositoryError } from '../repository';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
import { mapProfile } from './profile-repository';
import type { Match } from '@/types/domain';
const reasonSchema = z.object({
  signal: z.enum([
    'capability',
    'offer',
    'need',
    'area',
    'availability',
    'language',
    'connection',
    'review',
  ]),
  fact: z.string().min(1).max(500),
  count: z.number().nullable(),
  number: z.number().nullable(),
});
export function matchingRepository(): Pick<MneloRepository, 'matches' | 'profileIntents'> {
  const client = supabaseClient();
  return {
    async matches(id) {
      const { data, error } = await client.rpc('find_matches', { request: id });
      if (error) throw repositoryError(error);
      const matches = new Map<string, Match>();
      for (const row of data ?? []) {
        if (!['strong', 'good', 'possible'].includes(row.rank_label))
          throw new RepositoryError('UNAVAILABLE');
        const card = matches.get(row.candidate_id) ?? {
          profile: mapProfile(row.profile),
          rank: row.rank_label as Match['rank'],
          reasons: [],
        };
        card.reasons.push(
          reasonSchema.parse({
            signal: row.signal,
            fact: row.fact,
            count: row.value_count,
            number: row.value_number,
          }),
        );
        matches.set(row.candidate_id, card);
      }
      return [...matches.values()];
    },
    async profileIntents(id) {
      const { data, error } = await client.rpc('get_profile_intents', { target: id });
      if (error) throw repositoryError(error);
      return (data ?? []).map((row) => ({
        id: row.id,
        mode: row.mode === 'offer' ? ('offer' as const) : ('need' as const),
        capability: row.capability,
        area: row.coarse_area,
        neededOn: row.needed_on,
      }));
    },
  };
}
