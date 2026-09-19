import { useEffect, useState } from 'react';
import { FlatList, Keyboard, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Avatar, IconButton, Row, StateView, ui } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { searchPhonebook } from '../phonebook';
import { observePhonebook } from '../phonebook-events';
import { usePhoneService, usePhoneAction } from '../screens/phone-shared';
import { CallActions, type CallTarget } from '../screens/CallActions';
import { PeerAvatar } from './ContactCard';
import { fallbackAvatarColor } from '../avatar-color';
import type { Contact } from '../model';

export function CallContactSearch({
  search,
  embedded = false,
}: {
  search: string;
  embedded?: boolean;
}) {
  const { engine, view, identity, enrollment, calls, mesh } = useDevice();
  const { client, status } = usePhoneService();
  const cache = useQueryClient();
  const action = usePhoneAction();
  const { t } = useTranslation();
  const [query, setQuery] = useState(search.trim());
  const [revision, setRevision] = useState(0);
  const [unavailable, setUnavailable] = useState<CallTarget | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => observePhonebook(() => setRevision((v) => v + 1)), []);
  const result = useQuery({
    queryKey: [
      'device',
      'call-search',
      identity?.key,
      query,
      revision,
      Boolean(status.data?.registered),
    ],
    enabled: Boolean(query),
    networkMode: 'always',
    retry: false,
    queryFn: async ({ signal }) => {
      const contacts = await view.contacts();
      const numeric = /^\+?[\d ()-]+$/.test(query) && /\d/.test(query);
      const needle = query.normalize('NFC').toLocaleLowerCase();
      const matches: (Contact & { saved: boolean })[] = contacts
        .filter(
          (c) =>
            !c.blocked &&
            c.key !== identity?.key &&
            (c.name.normalize('NFC').toLocaleLowerCase().includes(needle) ||
              (numeric && Boolean(c.phone?.includes(query.replace(/\D/g, ''))))),
        )
        .map((c) => ({ ...c, saved: true }));
      let incomplete = false;
      if (!client || !status.data?.registered || query.length < 2) return { matches, incomplete };
      const phoneMatches = await searchPhonebook(query, enrollment?.phone, signal).catch(() => {
        incomplete = true;
        return [];
      });
      for (const candidate of phoneMatches) {
        if (signal.aborted) return { matches: [], incomplete: false };
        if (matches.some((c) => c.phone === candidate.phone)) continue;
        const found = await cache
          .fetchQuery({
            queryKey: ['call-lookup', identity?.key, candidate.phone],
            queryFn: () => client.execute({ action: 'lookup', phone: candidate.phone }),
            staleTime: 600000,
            gcTime: 600000,
            retry: false,
          })
          .catch(() => null);
        if (signal.aborted) return { matches: [], incomplete: false };
        if (!found?.key || found.key === identity?.key || matches.some((c) => c.key === found.key))
          continue;
        const saved = contacts.find((c) => c.key === found.key);
        const bound = contacts.find((c) => c.phone === candidate.phone);
        if (saved?.blocked || (bound && bound.key !== found.key)) continue;
        matches.push({
          key: found.key,
          phone: candidate.phone,
          name: candidate.name,
          blocked: false,
          saved: Boolean(saved),
        });
      }
      return { matches, incomplete };
    },
  });
  function start(contact: Contact & { saved: boolean }, media: 'voice' | 'video') {
    void action.run(async () => {
      const current = calls?.snapshot();
      if (current && !['ended', 'failed'].includes(current.status)) {
        router.push({ pathname: '/call/[id]', params: { id: current.chat } });
        return;
      }
      const latest = (await engine.contacts()).find((c) => c.key === contact.key);
      if (latest?.blocked) throw new Error('CONTACT_BLOCKED');
      let id: string;
      if (!latest && contact.phone && client) {
        const check = await client.execute({ action: 'lookup', phone: contact.phone });
        if (check.key !== contact.key) throw new Error('PHONE_IDENTITY_CHANGED');
        id = await engine.trustPhoneContact({
          key: contact.key,
          phone: contact.phone,
          name: contact.name,
        });
      } else if (latest) id = await engine.trustContact({ key: latest.key, name: latest.name });
      else throw new Error('CONTACT_UNAVAILABLE');
      Keyboard.dismiss();
      if (!calls || (!calls.supportsQueuedSignaling && !mesh?.online(contact.key))) {
        setUnavailable(contact);
        return;
      }
      await calls.start(contact.key, media);
      router.push({ pathname: '/call/[id]', params: { id } });
    });
  }
  return (
    <>
      <FlatList
        style={embedded ? undefined : ui.flex}
        scrollEnabled={!embedded}
        showsVerticalScrollIndicator={false}
        data={query === search.trim() ? (result.data?.matches ?? []) : []}
        keyExtractor={(c) => c.key}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Row
            title={item.name}
            subtitle={item.phone}
            left={
              item.saved ? (
                <PeerAvatar peer={item.key} name={item.name} colorfulFallback />
              ) : (
                <Avatar
                  name={item.name}
                  fallbackRingColor={fallbackAvatarColor('peer:' + item.key)}
                />
              )
            }
            right={
              <View style={ui.headerActions}>
                <IconButton
                  icon="phone"
                  label={t('compose.voice', { name: item.name })}
                  disabled={action.busy}
                  onPress={() => start(item, 'voice')}
                />
                <IconButton
                  icon="video"
                  label={t('compose.video', { name: item.name })}
                  disabled={action.busy}
                  onPress={() => start(item, 'video')}
                />
              </View>
            }
          />
        )}
        ListFooterComponent={
          result.data?.incomplete && result.data.matches.length > 0 ? (
            <StateView error={t('phone.failed')} onRetry={() => void result.refetch()} />
          ) : null
        }
        ListEmptyComponent={
          <StateView
            loading={query !== search.trim() || result.isPending}
            message={t('callSearch.empty')}
            error={result.isError || result.data?.incomplete ? t('phone.failed') : undefined}
            onRetry={() => void result.refetch()}
          />
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      {unavailable && <CallActions target={unavailable} onClose={() => setUnavailable(null)} />}
    </>
  );
}
