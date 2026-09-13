import {
  Contact,
  ContactField,
  addContactsChangeListener,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-contacts';
import { Linking, Platform } from 'react-native';
import { phonebookChanged } from './phonebook-events';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import type { PhonebookAccess } from './phonebook-access';
import { internationalPhone } from './phone-protocol';

let permissionRequest: Promise<void> | undefined;
// Contextual first use only. Denied/limited access is never expanded automatically.
export async function ensurePhonebookAccess() {
  if (!permissionRequest) {
    permissionRequest = (async () => {
      const permission = await getPermissionsAsync();
      if (permission.status === 'undetermined' && permission.canAskAgain !== false) {
        await requestPermissionsAsync();
        phonebookChanged();
      }
    })().finally(() => {
      permissionRequest = undefined;
    });
  }
  await permissionRequest;
}

export async function phonebookAccess(): Promise<PhonebookAccess> {
  const permission = await getPermissionsAsync();
  if (permission.accessPrivileges === 'limited') return 'limited';
  if (permission.granted) return 'available';
  return permission.canAskAgain === false ? 'settings' : 'request';
}
export async function managePhonebookAccess() {
  const access = await phonebookAccess();
  if (access === 'request') await requestPermissionsAsync();
  else if (access === 'limited' && Platform.OS === 'ios') await Contact.presentAccessPicker();
  else if (access === 'settings' || access === 'limited') await Linking.openSettings();
  phonebookChanged();
}
export function observeNativePhonebook(listener: () => void) {
  const subscription = addContactsChangeListener(listener);
  return () => subscription.remove();
}

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
  const contacts = await matchedPhoneContacts(numbers, ownNumber);
  return new Map(
    [...contacts].flatMap(([phone, contact]) => (contact.name ? [[phone, contact.name]] : [])),
  );
}

const pendingSaves = new Map<string, Promise<boolean>>();
export async function hasPhoneContact(number: string, ownNumber?: string) {
  return (await matchedPhoneContacts([number], ownNumber)).has(number);
}
export async function addPhoneContact(number: string, name: string, ownNumber?: string) {
  internationalPhone.parse(number);
  const pending = pendingSaves.get(number);
  if (pending) return pending;
  const save = savePhoneContact(number, name, ownNumber).finally(() => pendingSaves.delete(number));
  pendingSaves.set(number, save);
  return save;
}
async function savePhoneContact(number: string, name: string, ownNumber?: string) {
  await ensurePhonebookAccess();
  if (!(await phonebookPermission())) throw new Error('PHONE_CONTACTS_PERMISSION');
  if ((await matchedPhoneContacts([number], ownNumber)).has(number)) {
    phonebookChanged();
    return true;
  }
  if (!(await phonebookPermission())) throw new Error('PHONE_CONTACTS_PERMISSION');
  const givenName = name.trim() === number ? '' : name.trim();
  await Contact.create({ givenName, phones: [{ label: 'mobile', number }] });
  phonebookChanged();
  return true;
}

async function matchedPhoneContacts(numbers: readonly string[], ownNumber?: string) {
  const matches = new Map<string, { name: string | null }>();
  if (!numbers.length || !(await phonebookPermission())) return matches;
  const wanted = new Set(numbers);
  const country = parsePhoneNumberFromString(ownNumber ?? numbers[0] ?? '')?.country;
  // Only matched names live in memory. Never upload or persist the address book.
  for (let offset = 0; ; offset += 200) {
    const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES], {
      limit: 200,
      offset,
    });
    for (const row of rows) {
      for (const phone of row.phones ?? []) {
        const number =
          phone.number &&
          // Contacts copied from messages can contain invisible direction marks.
          // Remove presentation marks only; never match just a number's suffix.
          parsePhoneNumberFromString(
            phone.number.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim(),
            {
              ...(country ? { defaultCountry: country } : {}),
              extract: false,
            },
          )?.number;
        if (number && wanted.has(number) && !matches.has(number))
          matches.set(number, {
            name:
              row.fullName
                ?.trim()
                .normalize('NFC')
                .slice(0, 60)
                .replace(/[\uD800-\uDBFF]$/, '') || null,
          });
      }
    }
    // Recheck even the last page: revocation must discard any earlier matches.
    if (!(await phonebookPermission())) return new Map();
    if (rows.length < 200 || matches.size === wanted.size) return matches;
  }
}
