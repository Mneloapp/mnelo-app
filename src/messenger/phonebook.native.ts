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
import {
  phonebookName,
  phonebookNumber,
  rememberPhonebookName,
  type PhonebookMatch,
} from './phonebook-match';

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
const pendingNameReads = new Map<string, Promise<Map<string, string>>>();
export async function savedPhoneNames(
  numbers: readonly string[],
  ownNumber?: string,
): Promise<Map<string, string>> {
  // Startup warms caller IDs and chat names together. Share only an in-flight
  // scan of the same numbers; every later read rechecks permission and Contacts.
  const wanted = [...new Set(numbers)].sort();
  const country = parsePhoneNumberFromString(ownNumber ?? numbers[0] ?? '')?.country;
  const key = JSON.stringify([country, wanted]);
  let pending = pendingNameReads.get(key);
  if (!pending) {
    pending = readPhoneNames(wanted, ownNumber ?? numbers[0]).finally(() => {
      pendingNameReads.delete(key);
    });
    pendingNameReads.set(key, pending);
  }
  // Readers cannot change another surface's presentation map.
  return new Map(await pending);
}
async function readPhoneNames(numbers: readonly string[], ownNumber?: string) {
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

export async function savedPhoneContact(number: string, ownNumber?: string) {
  return (await matchedPhoneContacts([number], ownNumber)).get(number) ?? null;
}
let contactForm: Promise<boolean> | undefined;
export async function presentPhoneContact(
  number: string,
  name: string,
  ownNumber?: string,
): Promise<boolean> {
  internationalPhone.parse(number);
  if (contactForm) return false;
  contactForm = (async () => {
    await ensurePhonebookAccess();
    if (!(await phonebookPermission())) throw new Error('PHONE_CONTACTS_PERMISSION');
    const existing = await savedPhoneContact(number, ownNumber);
    let saved: boolean;
    if (existing?.id) saved = await new Contact(existing.id).editWithForm();
    else if (existing)
      return true; // Never duplicate a matched entry with an unavailable identifier.
    else
      saved = await Contact.presentCreateForm({
        givenName: name.trim() === number ? '' : name.trim(),
        phones: [{ label: 'mobile', number }],
      });
    phonebookChanged();
    return saved;
  })().finally(() => {
    contactForm = undefined;
  });
  return contactForm;
}

async function matchedPhoneContacts(numbers: readonly string[], ownNumber?: string) {
  const matches = new Map<string, PhonebookMatch>();
  if (!numbers.length || !(await phonebookPermission())) return matches;
  const wanted = new Set(numbers);
  const country = parsePhoneNumberFromString(ownNumber ?? numbers[0] ?? '')?.country;
  // Scan locally and discard unrelated entries. The app may retain matched
  // Mnelo-contact aliases in its encrypted display cache, never the address book.
  for (let offset = 0; ; offset += 200) {
    const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES], {
      limit: 200,
      offset,
    });
    for (const row of rows) {
      for (const phone of row.phones ?? []) {
        const number = phone.number && phonebookNumber(phone.number, country);
        if (number && wanted.has(number))
          rememberPhonebookName(matches, number, row.fullName, row.id);
      }
    }
    // Recheck even the last page: revocation must discard any earlier matches.
    if (!(await phonebookPermission())) return new Map();
    if (
      rows.length < 200 ||
      (matches.size === wanted.size && [...matches.values()].every((contact) => contact.name))
    )
      return matches;
  }
}

// Search locally first. Only the small matching page is eligible for an explicit
// Mnelo lookup; names and the rest of the address book never leave the phone.
export async function searchPhonebook(query: string, ownNumber?: string, signal?: AbortSignal) {
  const needle = query.trim().normalize('NFC').toLocaleLowerCase();
  const numeric = /^\+?[\d ()-]+$/.test(needle);
  const digits = numeric ? needle.replace(/\D/g, '') : '';
  const matches = new Map<string, { phone: string; name: string }>();
  if (needle.length < 2 || !(await phonebookPermission())) return [];
  const country = parsePhoneNumberFromString(ownNumber ?? '')?.country;
  for (let offset = 0; ; offset += 200) {
    if (signal?.aborted) return [];
    const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES], {
      limit: 200,
      offset,
    });
    for (const row of rows) {
      const name = phonebookName(row.fullName) ?? '';
      const nameMatches = !numeric && name.toLocaleLowerCase().includes(needle);
      for (const entry of row.phones ?? []) {
        const phone = entry.number && phonebookNumber(entry.number, country);
        if (
          phone &&
          phone !== ownNumber &&
          (nameMatches || Boolean(digits && phone.includes(digits)))
        )
          matches.set(phone, { phone, name: name || phone });
        if (matches.size >= 8) break;
      }
      if (matches.size >= 8) break;
    }
    if (signal?.aborted || !(await phonebookPermission())) return [];
    if (rows.length < 200 || matches.size >= 8) return [...matches.values()];
  }
}
