import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDevice } from './DeviceProvider';
import { usePhoneService } from './screens/phone-shared';
import { searchPhonebook } from './phonebook';
import { observePhonebook } from './phonebook-events';
import type { Contact } from './model';

export function useGroupRecipients(search: string) {
  const { view, identity, enrollment } = useDevice();
  const { client, status } = usePhoneService();
  const cache = useQueryClient();
  const [query, setQuery] = useState(search.trim());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => observePhonebook(() => setRevision((value) => value + 1)), []);
  const result = useQuery({
    queryKey: [
      'device',
      'group-recipients',
      identity?.key,
      query,
      revision,
      Boolean(status.data?.registered),
    ],
    networkMode: 'always',
    retry: false,
    queryFn: async ({ signal }) => {
      const contacts = await view.contacts();
      const needle = query.normalize('NFC').toLocaleLowerCase();
      const digits = query.replace(/\D/g, '');
      const numeric = /^\+?[\d ()-]+$/.test(query) && Boolean(digits);
      const matches: Contact[] = contacts.filter(
        (contact) =>
          !contact.blocked &&
          contact.key !== identity?.key &&
          (contact.name.normalize('NFC').toLocaleLowerCase().includes(needle) ||
            (numeric && contact.phone?.includes(digits))),
      );
      let incomplete = false;
      if (!client || !status.data?.registered || query.length < 2) return { matches, incomplete };
      const phoneMatches = await searchPhonebook(query, enrollment?.phone, signal).catch(() => {
        incomplete = true;
        return [];
      });
      for (const candidate of phoneMatches) {
        if (signal.aborted) break;
        if (matches.some((contact) => contact.phone === candidate.phone)) continue;
        const found = await cache
          .fetchQuery({
            queryKey: ['call-lookup', identity?.key, candidate.phone],
            queryFn: () => client.execute({ action: 'lookup', phone: candidate.phone }),
            staleTime: 600000,
            gcTime: 600000,
            retry: false,
          })
          .catch(() => {
            incomplete = true;
            return null;
          });
        if (
          !found?.key ||
          found.key === identity?.key ||
          matches.some((contact) => contact.key === found.key)
        )
          continue;
        const saved = contacts.find((contact) => contact.key === found.key);
        const bound = contacts.find((contact) => contact.phone === candidate.phone);
        if (saved?.blocked || (bound && bound.key !== found.key)) continue;
        matches.push(
          saved ?? { key: found.key, phone: candidate.phone, name: candidate.name, blocked: false },
        );
      }
      return { matches, incomplete };
    },
  });
  return {
    ...result,
    waiting: query !== search.trim(),
    matches: query === search.trim() ? (result.data?.matches ?? []) : [],
  };
}
