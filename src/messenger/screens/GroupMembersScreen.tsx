import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { IconButton, Page, StateView } from '@/components/ui';
import { SearchField } from '@/components/SearchField';
import { useDevice } from '../DeviceProvider';
import { Check, useLocalAction } from './shared';
import { useGroupInfo } from './GroupScreen';

export function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, view, identity } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const { group, members } = useGroupInfo(id);
  const contacts = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const current = new Set(members.data?.map((member) => member.key));
  const additions = selected.filter((key) => !current.has(key));
  const owner = group.data?.owner === identity?.key && !group.data?.left_group;
  const ready = owner && !!members.data && !!contacts.data;
  const available =
    contacts.data?.filter(
      (contact) => !contact.blocked && contact.key !== identity?.key && !current.has(contact.key),
    ) ?? [];
  const shown = available.filter((contact) =>
    (contact.name + ' ' + (contact.phone ?? ''))
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <Page
      title={t('messenger.groupAddMembers')}
      back
      right={
        <IconButton
          icon="check"
          label={t('messenger.groupAddMembers')}
          disabled={
            !ready || action.busy || !additions.length || current.size + additions.length > 16
          }
          onPress={() =>
            void action.run(async () => {
              await engine.changeGroupMembers(id, { add: additions });
              router.back();
            })
          }
        />
      }
    >
      <SearchField label={t('compose.search')} value={search} onChangeText={setSearch} />
      <AppText tone="secondary" variant="caption">
        {t('messenger.groupMemberCount', {
          count: Math.max(0, current.size - 1) + additions.length,
          limit: 15,
        })}
      </AppText>
      {ready &&
        shown.map((contact) => (
          <Check
            key={contact.key}
            label={contact.name}
            value={additions.includes(contact.key)}
            onChange={(value) => {
              if (action.busy || (value && current.size + additions.length >= 16)) return;
              setSelected((keys) =>
                value ? [...keys, contact.key] : keys.filter((key) => key !== contact.key),
              );
            }}
          />
        ))}
      {ready && !shown.length && (
        <AppText tone="secondary">{t('messenger.groupNoNewMembers')}</AppText>
      )}
      {group.isPending ||
      members.isPending ||
      contacts.isPending ||
      action.error ||
      group.isError ||
      members.isError ||
      contacts.isError ? (
        <StateView
          loading={group.isPending || members.isPending || contacts.isPending}
          error={
            action.error ??
            (group.isError || members.isError || contacts.isError
              ? t('messenger.genericError')
              : undefined)
          }
        />
      ) : null}
    </Page>
  );
}
