import { z } from 'zod';
// Keep server code outside the mobile dependency graph; parity is exercised in tests.
export function validCoarseArea(area: string): boolean {
  return (
    area.length <= 120 &&
    /^[\p{L}\p{M} .'-]+$/u.test(area) &&
    !/\b(street|avenue|road|apartment|house|floor|unit|apt|ave|rd|st)\b|ქუჩა|გამზირი|ბინა|სართული/iu.test(
      area,
    )
  );
}

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,23}$/),
  bio: z.string().trim().max(500),
  area: z
    .string()
    .trim()
    .transform((value) => value.normalize('NFC'))
    .refine((value) => value.length <= 100 && (!value || validCoarseArea(value))),
  capabilities: z.array(z.string().trim().min(1).max(240)).max(12),
});
