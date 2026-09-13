import { Contact, getPermissionsAsync } from 'expo-contacts';
import { RepositoryError } from '@/services/repository';

export async function chooseDeviceContactName(): Promise<string | null> {
  try {
    const person = await Contact.presentPicker();
    if (!person) return null;
    const given = await person.getGivenName();
    const family = await person.getFamilyName();
    return [given, family].filter(Boolean).join(' ');
  } catch (error) {
    // Reading the selected contact can still require OS consent. Check its actual
    // state; do not mislabel a denial as a server outage or request broader access.
    const permission = await getPermissionsAsync();
    if (permission.status === 'denied') throw new RepositoryError('CONTACTS_PERMISSION_REQUIRED');
    throw error;
  }
}
