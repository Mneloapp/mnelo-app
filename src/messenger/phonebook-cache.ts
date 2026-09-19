import { z } from 'zod';
import { peerKey, type Contact } from './model';

export type PhonebookCacheScope = { owner: string; phone: string; bindings: string };

export function phonebookBindings(contacts: readonly Contact[]) {
  return contacts
    .filter((contact) => contact.phone && !contact.blocked)
    .map((contact) => `${contact.key}:${contact.phone}`)
    .sort()
    .join('|');
}

// Only names already matched to existing Mnelo contacts are retained. This is
// a disposable presentation snapshot, never an address-book import or identity.
const cachedAliases = z.array(z.tuple([peerKey, z.string().trim().min(1).max(60)])).max(1000);
export function readCachedAliases(text: string, allowed: ReadonlySet<string>) {
  if (text.length > 180_000) throw new Error('PHONEBOOK_CACHE_INVALID');
  const rows = cachedAliases.parse(JSON.parse(text));
  if (
    rows.some(([peer]) => !allowed.has(peer)) ||
    new Set(rows.map(([peer]) => peer)).size !== rows.length
  )
    throw new Error('PHONEBOOK_CACHE_INVALID');
  return new Map(rows);
}
