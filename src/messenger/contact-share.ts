import type { Contact, LocalMessage } from './model';
import { internationalPhone } from './phone-protocol';

type SharedContact = Pick<Contact, 'key' | 'name' | 'phone'>;
function cleanName(value: string) {
  return value
    .replace(/mnelo1:[^\s]*/gi, '')
    .replace(/\b[a-f0-9]{64}\b/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
}
export function shareableContactPhone(contact: Pick<Contact, 'phone'>): string | null {
  const parsed = internationalPhone.safeParse(contact.phone);
  return parsed.success ? parsed.data : null;
}
export function encodeSharedContact(contact: Pick<Contact, 'name' | 'phone'>): string {
  const phone = shareableContactPhone(contact);
  if (!phone) throw new Error('CONTACT_PHONE_UNAVAILABLE');
  return [cleanName(contact.name), phone].filter(Boolean).join('\n');
}

// Legacy keys are lookup hints only. A contact card never establishes a trusted
// phone binding; use the recipient's existing local binding, or omit the number.
export function readSharedContact(body: string, contacts: readonly SharedContact[] = []) {
  const legacy = body.match(/(?:^|\n)mnelo1:([a-f0-9]{64})\s*$/i);
  if (legacy) {
    const known = contacts.find((contact) => contact.key === legacy[1]?.toLowerCase());
    return {
      name: cleanName(known?.name ?? body.slice(0, legacy.index)),
      phone: known ? shareableContactPhone(known) : null,
    };
  }
  const lines = body.trim().split(/\r?\n/);
  const phone = shareableContactPhone({ phone: lines.at(-1) ?? '' });
  return { name: cleanName(phone ? lines.slice(0, -1).join(' ') : body), phone };
}
export function sharedContactText(body: string, contacts: readonly SharedContact[] = []) {
  const contact = readSharedContact(body, contacts);
  return [contact.name, contact.phone].filter(Boolean).join('\n');
}
export function forwardSharedContact(body: string, contacts: readonly SharedContact[] = []) {
  const contact = readSharedContact(body, contacts);
  return encodeSharedContact({
    name: contact.name,
    ...(contact.phone ? { phone: contact.phone } : {}),
  });
}
export function presentSharedContact(message: LocalMessage, contacts: readonly SharedContact[]) {
  return message.kind === 'contact'
    ? { ...message, body: sharedContactText(message.body, contacts) }
    : message;
}
