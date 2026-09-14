import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

// Shared by the app and its native share extension. Match the whole number,
// including its country, and keep address-book names in presentation only.
export function phonebookNumber(raw: string, country?: CountryCode) {
  return parsePhoneNumberFromString(
    raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim(),
    { ...(country ? { defaultCountry: country } : {}), extract: false },
  )?.number;
}

export function phonebookName(raw?: string | null) {
  return (
    raw
      ?.trim()
      .normalize('NFC')
      .slice(0, 60)
      .replace(/[\uD800-\uDBFF]$/, '') || null
  );
}
