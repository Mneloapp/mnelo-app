import { normalizePhoneEntry, updatePhoneEntry, type PhoneEntry } from '@/messenger/phone-entry';

const georgia: PhoneEntry = { country: 'GE', number: '' };

test('registration composes the selected calling code with the national number', () => {
  expect(normalizePhoneEntry({ country: 'GE', number: '555 01 01 01' })).toBe('+995555010101');
  expect(normalizePhoneEntry({ country: 'US', number: '(202) 555-0101' })).toBe('+12025550101');
  expect(normalizePhoneEntry({ country: 'GB', number: '07911 123456' })).toBe('+447911123456');
});

test('a complete international paste splits the visible country and national number without duplication', () => {
  for (const [input, country, number, expected] of [
    ['+995 555 01 01 01', 'GE', '555010101', '+995555010101'],
    ['+1 (202) 555-0101', 'US', '2025550101', '+12025550101'],
    ['+44 7400 123456', 'GB', '7400123456', '+447400123456'],
  ]) {
    const entry = updatePhoneEntry(georgia, input!);
    expect(entry).toEqual({ country, number });
    expect(normalizePhoneEntry(entry)).toBe(expected);
  }
});

test('incomplete and unsupported pasted input is retained without silently selecting a destination', () => {
  for (const input of ['+44', 'Call +12025550101', '+80012345678']) {
    const entry = updatePhoneEntry(georgia, input);
    expect(entry).toEqual({ ...georgia, number: input });
    expect(() => normalizePhoneEntry(entry)).toThrow();
  }
});

test('national entry cannot bypass validation or silently override a selected country using an exit code', () => {
  for (const number of ['', '1234', 'call 555010101', '555010101 ext 1', '5'.repeat(31)])
    expect(() => normalizePhoneEntry({ ...georgia, number })).toThrow();
  expect(() => normalizePhoneEntry({ country: 'GB', number: '00 1 2025550101' })).toThrow();
  expect(() => normalizePhoneEntry({ country: 'US', number: '555010101' })).toThrow();
});
