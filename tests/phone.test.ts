import { normalizePhone } from '@/features/auth/phone';
it('normalizes Georgian national input', () =>
  expect(normalizePhone('555 01 01 01', 'GE')).toBe('+995555010101'));
it('handles national trunk prefixes using country metadata', () =>
  expect(normalizePhone('07911 123456', 'GB')).toBe('+447911123456'));
it('preserves an explicit international prefix independently of selected country', () =>
  expect(normalizePhone('+44 7911 123456', 'GE')).toBe('+447911123456'));
it('rejects short and arbitrary text without contacting Auth', () =>
  expect(() => normalizePhone('not a number', 'GE')).toThrow('INVALID'));
it('allows reserved invalid-range test numbers only with explicit development context', () => {
  expect(normalizePhone('5555550101', 'US', true)).toBe('+15555550101');
  expect(() => normalizePhone('5555550101', 'US', false)).toThrow('INVALID');
});
