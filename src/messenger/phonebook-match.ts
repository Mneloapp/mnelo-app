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

export type PhonebookMatch = { name: string | null; aliases: string[] };

// Callers enumerate in the phone's contact order. Keep that first nonempty name
// for presentation, while retaining other names for the same full phone locally.
export function rememberPhonebookName(
  matches: Map<string, PhonebookMatch>,
  number: string,
  raw?: string | null,
) {
  const name = phonebookName(raw);
  const match = matches.get(number) ?? { name: null, aliases: [] };
  if (name && !match.aliases.includes(name)) match.aliases.push(name);
  match.name ??= name;
  matches.set(number, match);
}
