import { validCoarseArea } from '../supabase/functions/_shared/intent';
import { profileInputSchema } from '../src/features/profiles/validation';
const valid = {
  displayName: ' ნინო ',
  username: 'NINO_DEV',
  bio: '',
  area: 'Vake',
  capabilities: ['Electrical installation'],
};
it('normalizes an identity without excluding Georgian display names', () => {
  expect(profileInputSchema.parse(valid)).toMatchObject({
    displayName: 'ნინო',
    username: 'nino_dev',
  });
});
it('rejects ambiguous or invalid username forms', () => {
  for (const username of ['a', '@nino', 'two words', '1user', 'x'.repeat(25)])
    expect(profileInputSchema.safeParse({ ...valid, username }).success).toBe(false);
});
it('bounds capability length and count before transport', () => {
  expect(profileInputSchema.safeParse({ ...valid, capabilities: ['x'.repeat(241)] }).success).toBe(
    false,
  );
  expect(
    profileInputSchema.safeParse({
      ...valid,
      capabilities: Array.from({ length: 13 }, (_, i) => String(i)),
    }).success,
  ).toBe(false);
});
it('drops undeclared server-controlled identity fields', () => {
  const value = profileInputSchema.parse({
    ...valid,
    verified: true,
    id: 'another-user',
    reputation: 5,
  });
  expect(value).not.toHaveProperty('verified');
  expect(value).not.toHaveProperty('id');
  expect(value).not.toHaveProperty('reputation');
});

it('keeps coarse Unicode areas while rejecting common precise-address formats', () => {
  for (const area of ['Vake', 'ვაკე', 'São Paulo', '', 'Saint-Germain'])
    expect(profileInputSchema.safeParse({ ...valid, area }).success).toBe(true);
  for (const area of [
    '41.7151, 44.8271',
    '12 Rustaveli',
    'Rustaveli Avenue',
    'რუსთაველის ქუჩა',
    'Main St',
    'Vake\nApartment',
  ])
    expect(profileInputSchema.safeParse({ ...valid, area }).success).toBe(false);
});

it('keeps mobile and server coarse-area safety behavior aligned', () => {
  for (const area of [
    'Vake',
    'ვაკე',
    'São Paulo',
    'Saint-Germain',
    '41.7151, 44.8271',
    '12 Rustaveli',
    'Rustaveli Avenue',
    'Main St',
    'რუსთაველის ქუჩა',
  ])
    expect(profileInputSchema.safeParse({ ...valid, area }).success).toBe(validCoarseArea(area));
});
