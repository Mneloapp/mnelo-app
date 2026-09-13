import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import { RepositoryError } from '@/services/repository';
export const localTestPhones: ReadonlySet<string> = new Set([
  '+15555550101',
  '+15555550102',
  '+15555550103',
]);
export function normalizePhone(
  input: string,
  country: CountryCode,
  localDevelopment = false,
): string {
  if (!/^[+0-9 ()-]{7,30}$/.test(input)) throw new RepositoryError('INVALID');
  const digits = input.replace(/\D/g, '');
  const candidate = input.trim().startsWith('+')
    ? '+' + digits
    : '+' + getCountryCallingCode(country) + digits;
  if (localDevelopment && localTestPhones.has(candidate)) return candidate;
  const phone = parsePhoneNumberFromString(input, country);
  if (!phone?.isValid()) throw new RepositoryError('INVALID');
  return phone.number;
}
