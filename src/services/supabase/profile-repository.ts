import type { MneloRepository } from '../repository';
import { RepositoryError } from '../repository';
import { supabaseClient } from './client';
import { repositoryError } from './errors';
import type { Database } from './database.types';
import type { Profile } from '@/types/domain';
import { profileInputSchema } from '@/features/profiles/validation';
type Summary = Database['public']['CompositeTypes']['profile_summary'];
export function mapProfile(row: Summary): Profile {
  if (!row.id || !row.username || !row.display_name) throw new RepositoryError('UNAVAILABLE');
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    bio: row.bio ?? '',
    area: row.coarse_area ?? '',
    avatarPath: row.avatar_path,
    capabilities: row.capabilities ?? [],
    languages: row.languages ?? [],
    availableToday: row.available_today ?? false,
    verified: row.verified ?? false,
    reviewCount: row.review_count ?? 0,
    averageRating: row.average_rating,
  };
}
export async function readProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabaseClient().rpc('get_profile', { target: id });
  if (error) throw repositoryError(error);
  return data?.[0] ? mapProfile(data[0]) : null;
}
export function profileRepository(): Pick<
  MneloRepository,
  | 'saveProfile'
  | 'profile'
  | 'searchProfiles'
  | 'revealPhone'
  | 'privacy'
  | 'updatePrivacy'
  | 'updateProfilePreferences'
  | 'uploadAvatar'
  | 'avatarUrl'
> {
  const client = supabaseClient();
  return {
    async saveProfile(input) {
      const parsed = profileInputSchema.safeParse(input);
      if (!parsed.success) throw new RepositoryError('INVALID');
      const v = parsed.data;
      const { data, error } = await client.rpc('save_profile', {
        display_name: v.displayName,
        username: v.username,
        bio: v.bio,
        coarse_area: v.area,
        capabilities: v.capabilities,
      });
      if (error) throw repositoryError(error);
      const profile = data && (await readProfile(data));
      if (!profile) throw new RepositoryError('UNAVAILABLE');
      return profile;
    },
    async profile(id) {
      const p = await readProfile(id);
      if (!p) throw new RepositoryError('FORBIDDEN');
      return p;
    },
    async searchProfiles(query) {
      if (query.trim().replace(/^@/, '').length < 2) return [];
      const { data, error } = await client.rpc('search_profiles', { query: query.trim() });
      if (error) throw repositoryError(error);
      return (data ?? []).map(mapProfile);
    },
    async revealPhone(target) {
      const { data, error } = await client.rpc('profile_phone', { target });
      if (error) throw repositoryError(error);
      if (data && !/^\+[1-9][0-9]{6,14}$/.test(data)) throw new RepositoryError('UNAVAILABLE');
      return data || null;
    },
    async privacy() {
      const { data, error } = await client
        .from('privacy_settings')
        .select('discoverability,phone_visibility,request_audience')
        .single();
      if (error) throw repositoryError(error);
      if (
        !data ||
        !['relevant', 'everyone', 'nobody'].includes(data.discoverability) ||
        !['relevant', 'mutual', 'everyone'].includes(data.request_audience)
      )
        throw new RepositoryError('UNAVAILABLE');
      return {
        discoverability: data.discoverability as 'relevant' | 'everyone' | 'nobody',
        phoneVisibility: data.phone_visibility === 'connections' ? 'connections' : 'nobody',
        exactLocation: 'never',
        requestAudience: data.request_audience as 'relevant' | 'mutual' | 'everyone',
      };
    },
    async updatePrivacy(input) {
      const { error } = await client.rpc('update_privacy', {
        discoverability: input.discoverability,
        phone_visibility: input.phoneVisibility,
        request_audience: input.requestAudience,
      });
      if (error) throw repositoryError(error);
    },
    async updateProfilePreferences(languages, availableToday) {
      const { error } = await client.rpc('update_profile_preferences', {
        languages,
        available_today: availableToday,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (error) throw repositoryError(error);
    },
    async uploadAvatar(bytes) {
      if (bytes.byteLength < 4 || bytes.byteLength > 2 * 1024 * 1024)
        throw new RepositoryError('INVALID');
      const { data, error } = await client.functions.invoke<{ profileId?: string; code?: string }>(
        'avatar',
        { body: bytes, headers: { 'Content-Type': 'image/jpeg' } },
      );
      if (error) throw repositoryError(error);
      if (!data?.profileId) throw new RepositoryError('UNAVAILABLE');
      const profile = await readProfile(data.profileId);
      if (!profile) throw new RepositoryError('UNAVAILABLE');
      return profile;
    },
    async avatarUrl(path) {
      const { data, error } = await client.storage.from('avatars').createSignedUrl(path, 60);
      if (error) throw repositoryError(error);
      return data.signedUrl;
    },
  };
}
