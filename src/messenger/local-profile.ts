import { z } from 'zod';
import { validAvatar } from './profile-avatar';

const optionalText = (limit: number) => z.string().trim().max(limit).default('');
export function safeWebsite(value: string): string | null {
  if (!value || value.length > 240 || /[\s\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.'))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

// Device-local display details. A username is not a globally reserved directory identity.
export const localProfile = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .max(32)
      .regex(/^(?:[a-z0-9_]{3,32})?$/),
    firstName: z.string().trim().max(60),
    lastName: z.string().trim().max(60),
    headline: optionalText(80),
    about: optionalText(240),
    email: optionalText(254).refine((value) => !value || z.email().safeParse(value).success),
    website: optionalText(240).refine((value) => !value || Boolean(safeWebsite(value))),
    avatar: z
      .string()
      .max(48_000)
      .default('')
      .refine((value) => !value || validAvatar(value)),
  })
  .strict()
  .refine((value) => [value.firstName, value.lastName].filter(Boolean).join(' ').length <= 60);
export type LocalProfile = z.infer<typeof localProfile>;
export type ProfileInput = z.input<typeof localProfile>;
export const emptyProfile = (): LocalProfile =>
  localProfile.parse({ username: '', firstName: '', lastName: '' });
export function profileName(profile: LocalProfile) {
  return (
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    (profile.username ? '@' + profile.username : 'Mnelo')
  );
}
