// Web previews cannot read a phone's contacts.
import type { PhonebookAccess } from './phonebook-access';
export async function phonebookAccess(): Promise<PhonebookAccess> {
  return 'unavailable';
}
export async function managePhonebookAccess() {}
export async function ensurePhonebookAccess() {}
export async function hasPhoneContact(_number: string, _ownNumber?: string) {
  return false;
}
export async function addPhoneContact(
  _number: string,
  _name: string,
  _ownNumber?: string,
): Promise<boolean> {
  throw new Error('PHONE_CONTACTS_UNAVAILABLE');
}
export function observeNativePhonebook(_listener: () => void) {
  return () => {};
}
export async function phonebookPermission() {
  return false;
}
export async function requestPhonebookPermission() {
  return false;
}
export async function savedPhoneName(_number: string, _ownNumber?: string): Promise<string | null> {
  return null;
}

export async function savedPhoneNames(
  _numbers: readonly string[],
  _ownNumber?: string,
): Promise<Map<string, string>> {
  return new Map();
}
export async function searchPhonebook(
  _query: string,
  _ownNumber?: string,
  _signal?: AbortSignal,
): Promise<{ phone: string; name: string }[]> {
  return [];
}
