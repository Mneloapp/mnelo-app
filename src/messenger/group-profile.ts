import { z } from 'zod';
import { localProfile } from './local-profile';

export const groupProfile = z
  .object({
    headline: localProfile.shape.headline,
    about: localProfile.shape.about,
    email: localProfile.shape.email,
    website: localProfile.shape.website,
    avatar: localProfile.shape.avatar,
  })
  .strict();
export type GroupProfile = z.infer<typeof groupProfile>;
export const emptyGroupProfile = (): GroupProfile => groupProfile.parse({});
export function readGroupProfile(chat?: { group_profile?: string } | null): GroupProfile {
  try {
    return groupProfile.parse(JSON.parse(chat?.group_profile ?? '{}'));
  } catch {
    return emptyGroupProfile();
  }
}
