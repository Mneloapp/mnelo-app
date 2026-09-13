import type { LocalProfile } from './local-profile';

export const profileFields = {
  name: ['firstName', 'lastName'],
  about: ['headline', 'about'],
  username: ['username'],
  links: ['email', 'website'],
} as const;
export type ProfileField = keyof typeof profileFields;
export type ProfileDraft = Partial<
  Pick<LocalProfile, (typeof profileFields)[ProfileField][number]>
>;
export function isProfileField(value: unknown): value is ProfileField {
  return typeof value === 'string' && Object.hasOwn(profileFields, value);
}
export function profileFieldDraft(profile: LocalProfile, field: ProfileField): ProfileDraft {
  return Object.fromEntries(profileFields[field].map((key) => [key, profile[key]]));
}
