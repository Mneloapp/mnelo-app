import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { phonebookChanged } from './phonebook-events';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export async function phonebookPermission() {
  const permission = await getPermissionsAsync();
  return permission.granted || permission.accessPrivileges === 'limited';
}
export async function requestPhonebookPermission() {
  const permission = await requestPermissionsAsync();
  phonebookChanged();
  return permission.granted || permission.accessPrivileges === 'limited';
}
export async function savedPhoneName(number: string, ownNumber?: string): Promise<string | null> {
  return (await savedPhoneNames([number], ownNumber ?? number)).get(number) ?? null;
}
export async function savedPhoneNames(
  numbers: readonly string[],
  ownNumber?: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!numbers.length || !(await phonebookPermission())) return names;
  const wanted = new Set(numbers);
  const country = parsePhoneNumberFromString(ownNumber ?? numbers[0] ?? '')?.country;
  // Only matched names live in memory. Never upload or persist the address book.
  for (let offset = 0; ; offset += 200) {
    const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES], {
      limit: 200,
      offset,
    });
    for (const row of rows) {
      if (!row.fullName?.trim()) continue;
      for (const phone of row.phones ?? []) {
        const number =
          phone.number &&
          parsePhoneNumberFromString(phone.number, {
            ...(country ? { defaultCountry: country } : {}),
            extract: false,
          })?.number;
        if (number && wanted.has(number) && !names.has(number))
          names.set(
            number,
            row.fullName
              .trim()
              .normalize('NFC')
              .slice(0, 60)
              .replace(/[\uD800-\uDBFF]$/, ''),
          );
      }
    }
    // Recheck even the last page: revocation must discard any earlier matches.
    if (!(await phonebookPermission())) return new Map();
    if (rows.length < 200 || names.size === wanted.size) return names;
  }
}
