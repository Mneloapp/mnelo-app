import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export async function phonebookPermission() {
  const permission = await getPermissionsAsync();
  return permission.granted || permission.accessPrivileges === 'limited';
}
export async function requestPhonebookPermission() {
  const permission = await requestPermissionsAsync();
  return permission.granted || permission.accessPrivileges === 'limited';
}
export async function savedPhoneName(number: string, ownNumber?: string): Promise<string | null> {
  if (!(await phonebookPermission())) return null;
  const country = parsePhoneNumberFromString(ownNumber ?? number)?.country;
  // Only names/numbers, one bounded page at a time. Never send or persist the
  // address book. The OS also enforces iOS limited-access selection.
  for (let offset = 0; ; offset += 200) {
    const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES], {
      limit: 200,
      offset,
    });
    for (const row of rows) {
      const matches = row.phones?.some(
        (phone) =>
          phone.number &&
          parsePhoneNumberFromString(phone.number, {
            ...(country ? { defaultCountry: country } : {}),
            extract: false,
          })?.number === number,
      );
      if (matches && row.fullName?.trim())
        return row.fullName
          .trim()
          .normalize('NFC')
          .slice(0, 60)
          .replace(/[\uD800-\uDBFF]$/, '');
    }
    if (rows.length < 200 || !(await phonebookPermission())) return null;
  }
}
