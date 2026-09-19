import type { DeviceMessenger } from './engine';
import type { PhoneClient } from './phone-client';
import { readSharedContact } from './contact-share';

// The card supplies a phone number, never a trusted identity. Resolve through
// our authenticated directory and refuse to replace a locally pinned binding.
export async function resolveSharedContact(
  engine: DeviceMessenger,
  client: Pick<PhoneClient, 'execute'>,
  body: string,
  current: () => boolean,
) {
  const owner = engine.currentIdentity()?.key;
  const check = () => {
    if (!owner || !current() || engine.currentIdentity()?.key !== owner)
      throw new Error('CONTACT_ACTION_CANCELLED');
  };
  check();
  const shared = readSharedContact(body, await engine.contacts());
  check();
  if (!shared.phone) throw new Error('PHONE_INVALID');
  const result = await client.execute({ action: 'lookup', phone: shared.phone });
  check();
  if (!result.key) throw new Error('PHONE_NOT_FOUND');
  if (result.key === owner) throw new Error('PHONE_SELF');
  const contacts = await engine.contacts();
  check();
  const bound = contacts.find((contact) => contact.phone === shared.phone);
  if (bound && bound.key !== result.key) throw new Error('PHONE_IDENTITY_CHANGED');
  const known = contacts.find((contact) => contact.key === result.key);
  if (known?.blocked) throw new Error('PHONE_BLOCKED');
  const name = known?.name || shared.name || shared.phone;
  const id = await engine.trustPhoneContact({ key: result.key, phone: shared.phone, name });
  check();
  await engine.trustContact({ key: result.key, name });
  check();
  return { id, key: result.key, name };
}
