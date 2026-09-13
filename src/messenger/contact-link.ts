import { contactSchema } from './model';

export type ContactInvitation = { key: string; name: string };
export const invitationOrigin = 'https://mnelo.com/invite';
export function contactPayload(input: ContactInvitation) {
  const contact = contactSchema.parse(input);
  return (
    'v1:' +
    contact.key +
    ':' +
    Array.from(new TextEncoder().encode(contact.name), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  );
}
export const contactLink = (input: ContactInvitation) =>
  invitationOrigin + '#' + contactPayload(input);
export function parseContactLink(input: unknown): ContactInvitation | null {
  // Reject unbounded input before any decoder or router query parser can run.
  if (typeof input !== 'string' || input.length > 600) return null;
  const value = input.trim();
  const match =
    /^(?:https:\/\/(?:www\.)?mnelo\.com\/invite#|mnelo:\/\/contact\/)(v1:([a-f0-9]{64}):([a-f0-9]{2,360}))$/.exec(
      value,
    );
  if (!match || match[3]!.length % 2) return null;
  try {
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(match[3]!.match(/../g)!, (byte) => parseInt(byte, 16)),
    );
    if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\ufffd]/.test(name)) return null;
    const result = contactSchema.safeParse({ key: match[2], name });
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
