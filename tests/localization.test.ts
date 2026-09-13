import { getCountries } from 'libphonenumber-js/min';
import { en } from '@/i18n/en';
import { ka } from '@/i18n/ka';
import { i18n } from '@/i18n';
import { createPreferences } from '@/stores/preferences-core';
import {
  formatCalendarDate,
  formatNumber,
  matchesConfirmation,
  countryName,
  formatTime,
} from '@/i18n/format';
import { intentTerm, intentArea } from '@/i18n/intent-labels';
function flat(value: object, path = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, text]) => {
      const name = path ? path + '.' + key : key;
      return typeof text === 'string' ? [[name, text]] : Object.entries(flat(text, name));
    }),
  );
}
afterEach(async () => {
  await i18n.changeLanguage('en');
});
test('every English key has explicit Georgian copy and identical interpolation variables', () => {
  const english = flat(en),
    georgian = flat(ka);
  expect(Object.keys(georgian).sort()).toEqual(Object.keys(english).sort());
  const same = new Set([
    'brand',
    'profile.usernamePlaceholder',
    'account.english',
    'account.georgian',
    'chats.conversationSummary',
    'calls.event',
    'messenger.googleMaps',
    'messenger.appleMaps',
    'messenger.googleCalendar', // Product name is unchanged across locales.
    'messenger.eventDatePlaceholder', // Literal ISO date/time input pattern.
  ]);
  for (const [key, value] of Object.entries(english)) {
    expect(georgian[key]?.trim()).toBeTruthy();
    expect((georgian[key]?.match(/{{[^}]+}}/g) ?? []).sort()).toEqual(
      (value.match(/{{[^}]+}}/g) ?? []).sort(),
    );
    if (!same.has(key)) expect(georgian[key]).not.toBe(value);
  }
});
test('plural forms, Georgian dates/numbers and canonical labels work without translating user data', async () => {
  expect(i18n.t('chats.unread', { count: 1 })).toBe('1 unread message');
  expect(i18n.t('chats.unread', { count: 2 })).toBe('2 unread messages');
  expect(i18n.t('messenger.tagline')).toBe('Your conversations. Your devices.');
  await i18n.changeLanguage('ka');
  expect(i18n.t('chats.unread', { count: 1 })).toBe('1 წაუკითხავი შეტყობინება');
  expect(formatNumber(4.5)).toBe('4,5');
  expect(formatCalendarDate('2026-09-08')).toContain('სექ');
  expect(formatCalendarDate('2026-02-30')).toBe('');
  expect(intentTerm('Electrical installation')).toBe('ელექტროსამუშაოები');
  expect(intentArea('Vake')).toBe('ვაკე');
  expect(intentTerm('Personal development text')).toBe('Personal development text');
  expect(matchesConfirmation('ᲬᲐᲨᲚᲐ', ka.account.confirmWord)).toBe(true);
  expect(matchesConfirmation('DELETE', ka.account.confirmWord)).toBe(false);
});
test('locale survives reconstruction; failed writes do not pretend to save a preference', async () => {
  let saved: string | null = null;
  const storage = {
    get: async () => saved,
    set: jest.fn(async (locale: string) => {
      saved = locale;
    }),
  };
  const first = createPreferences(storage);
  await first.getState().restore();
  await first.getState().setLocale('ka');
  const second = createPreferences(storage);
  await second.getState().restore();
  expect(second.getState().locale).toBe('ka');
  storage.set.mockRejectedValueOnce(new Error('Development storage failure'));
  await expect(second.getState().setLocale('en')).rejects.toBeDefined();
  expect(second.getState().locale).toBe('ka');
});
test('a late restore cannot undo a user selection and unknown persisted locales fall back safely', async () => {
  let resolve!: (value: string) => void;
  const store = createPreferences({
    get: () =>
      new Promise((r) => {
        resolve = r;
      }),
    set: async () => undefined,
  });
  const restore = store.getState().restore();
  await store.getState().setLocale('ka');
  resolve('en');
  await restore;
  expect(store.getState().locale).toBe('ka');
  const chosen = createPreferences({ get: async () => 'en', set: async () => undefined });
  await chosen.getState().setLocale('ka');
  await chosen.getState().restore();
  expect(chosen.getState().locale).toBe('ka');
  const unknown = createPreferences({ get: async () => 'unexpected', set: async () => undefined });
  await unknown.getState().restore();
  expect(unknown.getState().locale).toBe('en');
});

test('Georgian date, number and country labels do not require bundled Georgian ICU support', async () => {
  await i18n.changeLanguage('ka');
  expect(formatCalendarDate('2026-09-08')).toBe('8 სექ. 2026');
  expect(formatNumber(1234.5)).toBe('1\u00a0234,5');
  const date = new Date(2026, 8, 8, 0, 5);
  expect(formatTime(date.toISOString())).toBe('00:05');
  expect(countryName('GE', 'ka')).toBe('საქართველო');
  for (const country of getCountries()) expect(countryName(country, 'ka')).toMatch(/[ა-ჰ]/);
});

test('English country search remains usable without Intl.DisplayNames on Hermes', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'DisplayNames');
  Object.defineProperty(Intl, 'DisplayNames', { value: undefined, configurable: true });
  try {
    expect(countryName('US', 'en')).toBe('United States');
    expect(countryName('GE', 'en')).toBe('Georgia');
    for (const country of getCountries()) expect(countryName(country, 'en')).not.toBe(country);
    expect(countryName('__proto__', 'en')).toBe('__proto__');
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'DisplayNames', descriptor);
    else Reflect.deleteProperty(Intl, 'DisplayNames');
  }
});

test('Georgian numeric copy works on iOS Hermes without NumberFormat.formatToParts', async () => {
  await i18n.changeLanguage('ka');
  const descriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'formatToParts');
  Object.defineProperty(Intl.NumberFormat.prototype, 'formatToParts', {
    value: undefined,
    configurable: true,
  });
  try {
    expect(formatNumber(1234.5)).toBe('1\u00a0234,5');
    expect(formatNumber(-1234.56)).toBe('-1\u00a0234,6');
    expect(formatNumber(1000000)).toBe('1\u00a0000\u00a0000');
    expect(formatNumber(null)).toBe('0');
    await i18n.changeLanguage('en');
    expect(formatNumber(1234.5)).toBe('1,234.5');
  } finally {
    if (descriptor) Object.defineProperty(Intl.NumberFormat.prototype, 'formatToParts', descriptor);
    else Reflect.deleteProperty(Intl.NumberFormat.prototype, 'formatToParts');
  }
});

test.each(['en', 'ka'])('times are always local 24-hour HH:mm in %s', async (locale) => {
  await i18n.changeLanguage(locale);
  expect(formatTime(new Date(2026, 8, 13, 0, 5).toISOString())).toBe('00:05');
  expect(formatTime(new Date(2026, 8, 13, 12, 0).toISOString())).toBe('12:00');
  expect(formatTime(new Date(2026, 8, 13, 23, 57).toISOString())).toBe('23:57');
  expect(formatTime('invalid')).toBe('');
});
