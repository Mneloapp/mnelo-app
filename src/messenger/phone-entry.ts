import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import { internationalPhone } from './phone-protocol';

export type PhoneEntry = { country: CountryCode; number: string };

export function phoneEntryFromNumber(number = '', ownNumber?: string): PhoneEntry {
  const country = ownNumber ? parsePhoneNumberFromString(ownNumber)?.country : undefined;
  return updatePhoneEntry({ country: country ?? 'GE', number: '' }, number);
}

// A complete international paste updates both visible fields atomically. Incomplete or
// unsupported input stays visible and invalid instead of silently changing the destination.
export function updatePhoneEntry(current: PhoneEntry, input: string): PhoneEntry {
  const value = input.trim();
  if (/^\+[0-9 ()-]{7,29}$/.test(value)) {
    const parsed = parsePhoneNumberFromString(value, { extract: false });
    if (parsed?.isValid() && parsed.country)
      return { country: parsed.country, number: parsed.nationalNumber };
  }
  return { ...current, number: input };
}

export function normalizePhoneEntry({ country, number }: PhoneEntry): string {
  if (!/^[0-9 ()-]{7,30}$/.test(number)) throw new Error('PHONE_INVALID');
  const parsed = parsePhoneNumberFromString(number, { defaultCountry: country, extract: false });
  if (!parsed?.isValid() || parsed.countryCallingCode !== getCountryCallingCode(country))
    throw new Error('PHONE_INVALID');
  return internationalPhone.parse(parsed.number);
}
