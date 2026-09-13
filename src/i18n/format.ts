import { i18n } from './index';
import georgian from './cldr/ka.json';
import english from './cldr/en.json';
// A small pinned CLDR subset keeps Georgian presentation consistent even when a runtime
// does not ship Georgian ICU data. Dates here use the Gregorian calendar only.
function georgianDate(date: Date, utc = false) {
  const day = utc ? date.getUTCDate() : date.getDate();
  const month = String((utc ? date.getUTCMonth() : date.getMonth()) + 1);
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  return `${day} ${georgian.months[month as keyof typeof georgian.months]}. ${year}`;
}
export function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  if (i18n.language === 'ka') return georgianDate(date);
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(
    date,
  );
}
export function formatCalendarDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  // A requested calendar day is not a UTC instant; never shift it to another local day.
  if (i18n.language === 'ka') return georgianDate(date, true);
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
export function formatNumber(value: number | null | undefined) {
  const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
  const formatted = formatter.format(value ?? 0);
  if (i18n.language !== 'ka') return formatted;
  // iOS Hermes supports format(), but not NumberFormat.formatToParts(). The source
  // locale is explicitly English, so map its two separators in one pass while
  // keeping Intl's rounding, sign and grouping behavior.
  return formatted.replace(/[,.]/g, (separator) =>
    separator === '.' ? georgian.decimal : georgian.group,
  );
}
export function matchesConfirmation(value: string, expected: string) {
  return value.normalize('NFC').toLowerCase() === expected.normalize('NFC').toLowerCase();
}
export function countryName(code: string, locale: string) {
  const countries = locale === 'ka' ? georgian.countries : english.countries;
  return Object.hasOwn(countries, code) ? countries[code as keyof typeof countries] : code;
}
