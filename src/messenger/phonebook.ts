// Web previews cannot read a phone's contacts.
export async function phonebookPermission() {
  return false;
}
export async function requestPhonebookPermission() {
  return false;
}
export async function savedPhoneName(_number: string, _ownNumber?: string): Promise<string | null> {
  return null;
}
