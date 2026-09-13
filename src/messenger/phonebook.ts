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

export async function savedPhoneNames(
  _numbers: readonly string[],
  _ownNumber?: string,
): Promise<Map<string, string>> {
  return new Map();
}
