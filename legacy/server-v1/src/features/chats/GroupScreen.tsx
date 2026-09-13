import { ActionSheet } from '@/components/ActionSheet';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Avatar, Button, Field, Page, Row, Section, StateView, ui } from '@/components/ui';
import { ProfileAvatar } from '@/features/profiles/ProfileAvatar';
import { useAction } from '@/hooks/useAction';
import { useDebounced } from '@/hooks/useDebounced';
import { useSession } from '@/stores/session';
import { repository } from '@/services';
import type { GroupDetails } from '@/types/domain';
import { discardCachedMedia, imageSelection, mediaBytes, type SelectedMedia } from './media-files';

function ConnectionPicker({
  selected,
  excluded = [],
  onSelect,
}: {
  selected: string[];
  excluded?: string[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const q = useQuery({
    queryKey: ['connections', query],
    queryFn: () => repository().connections(query),
  });
  const people = q.data?.filter((p) => !excluded.includes(p.id));
  return (
    <View style={ui.stack}>
      <Field
        label={t('chats.searchPeople')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        maxLength={120}
      />
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : people?.length ? (
        people.map((p) => (
          <Row
            key={p.id}
            selected={selected.includes(p.id)}
            title={p.displayName}
            subtitle={'@' + p.username}
            left={<ProfileAvatar profile={p} />}
            right={
              <AppText>
                {selected.includes(p.id) ? t('common.selected') : t('common.select')}
              </AppText>
            }
            onPress={() => onSelect(p.id)}
          />
        ))
      ) : (
        <StateView message={t('groups.noConnections')} />
      )}
      {q.data?.length === 50 && <AppText variant="caption">{t('groups.refine')}</AppText>}
    </View>
  );
}
export function NewGroupScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [clientId] = useState(() => Crypto.randomUUID());
  const a = useAction();
  const cache = useQueryClient();
  return (
    <Page title={t('groups.new')} back>
      <Field label={t('groups.name')} value={name} onChangeText={setName} maxLength={80} />
      <Section title={t('groups.chooseMembers')}>
        <ConnectionPicker
          selected={selected}
          onSelect={(id) =>
            setSelected((s) =>
              s.includes(id) ? s.filter((x) => x !== id) : s.length < 31 ? [...s, id] : s,
            )
          }
        />
      </Section>
      <AppText variant="caption">{t('groups.selectedCount', { count: selected.length })}</AppText>
      <AppText tone="secondary">{t('groups.historyNotice')}</AppText>
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      <Button
        label={t('groups.create')}
        disabled={!name.trim() || selected.length < 2}
        busy={a.busy}
        onPress={() =>
          void a.run(
            () => repository().createGroup(name, selected, clientId),
            (c) => {
              void cache.invalidateQueries({ queryKey: ['conversations'] });
              router.replace({ pathname: '/chat/[id]', params: { id: c.id } });
            },
          )
        }
      />
    </Page>
  );
}
function GroupAvatar({ group }: { group: GroupDetails }) {
  const q = useQuery({
    queryKey: ['attachment', group.avatarId],
    queryFn: () => repository().attachment(group.avatarId!),
    enabled: Boolean(group.avatarId),
    staleTime: 30000,
    gcTime: 60000,
    refetchInterval: 45000,
  });
  return q.data && !q.isError ? (
    <Image
      accessible={false}
      source={{ uri: q.data.url, cache: 'reload' }}
      style={ui.avatarLarge}
    />
  ) : (
    <Avatar name={group.title} size="large" />
  );
}
function GroupAvatarEditor({ id, refresh }: { id: string; refresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const a = useAction();
  const [file, setFile] = useState<SelectedMedia | null>(null);
  const [clientId, setClientId] = useState(() => Crypto.randomUUID());
  return (
    <View style={ui.stack}>
      {file && (
        <Image
          source={{ uri: file.uri }}
          accessibilityLabel={t('profile.photoPreview')}
          style={ui.avatarLarge}
        />
      )}
      <Button
        variant="secondary"
        label={t('profile.changePhoto')}
        busy={a.busy}
        onPress={() =>
          void a.run(async () => {
            const next = await imageSelection();
            if (next) {
              if (file) discardCachedMedia(file.uri);
              setFile(next);
              setClientId(Crypto.randomUUID());
            }
          })
        }
      />
      {file && (
        <>
          <Button
            label={t('profile.savePhoto')}
            busy={a.busy}
            onPress={() =>
              void a.run(async () => {
                const attachment = await repository().uploadAttachment({
                  conversationId: id,
                  clientId,
                  name: file.name,
                  mime: file.mime,
                  bytes: await mediaBytes(file.uri),
                });
                await repository().setGroupAvatar(id, attachment);
                discardCachedMedia(file.uri);
                setFile(null);
                await refresh();
              })
            }
          />
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => {
              discardCachedMedia(file.uri);
              setFile(null);
            }}
          />
        </>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </View>
  );
}
function GroupControls({ group, refresh }: { group: GroupDetails; refresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const actor = useSession((s) => s.session?.userId);
  const [name, setName] = useState(group.title);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<GroupDetails['members'][number] | null>(null);
  const a = useAction();
  const admin = group.members.some((m) => m.id === actor && m.role === 'admin');
  return (
    <>
      <GroupAvatar group={group} />
      {admin && (
        <>
          <GroupAvatarEditor id={group.id} refresh={refresh} />
          {group.avatarId && (
            <Button
              label={t('groups.removePhoto')}
              variant="secondary"
              busy={a.busy}
              onPress={() =>
                void a.run(async () => {
                  await repository().setGroupAvatar(group.id, null);
                  await refresh();
                })
              }
            />
          )}
          <Field label={t('groups.name')} value={name} onChangeText={setName} maxLength={80} />
          <Button
            label={t('common.save')}
            disabled={!name.trim() || name.trim() === group.title}
            busy={a.busy}
            onPress={() =>
              void a.run(async () => {
                await repository().renameGroup(group.id, name);
                await refresh();
              })
            }
          />
        </>
      )}
      <Section title={t('groups.members', { count: group.members.length })}>
        {group.members.map((m) => (
          <Row
            key={m.id}
            title={m.displayName}
            subtitle={'@' + m.username}
            left={<Avatar name={m.displayName} />}
            right={<AppText variant="caption">{t(`groups.${m.role}`)}</AppText>}
            {...(admin && m.id !== actor ? { onPress: () => setSelected(m) } : {})}
          />
        ))}
      </Section>
      {admin && group.members.length < 32 && (
        <Button variant="secondary" label={t('groups.add')} onPress={() => setAdding((v) => !v)} />
      )}
      {adding && (
        <>
          <AppText tone="secondary">{t('groups.historyNotice')}</AppText>
          <ConnectionPicker
            selected={[]}
            excluded={group.members.map((m) => m.id)}
            onSelect={(target) =>
              void a.run(async () => {
                await repository().addGroupMember(group.id, target);
                await refresh();
                setAdding(false);
              })
            }
          />
        </>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      <ActionSheet
        title={selected?.displayName ?? group.title}
        visible={Boolean(selected)}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            {(['remove', selected.role === 'admin' ? 'demote' : 'promote'] as const).map(
              (action) => (
                <Button
                  key={action}
                  label={t(`groups.${action}`)}
                  variant="secondary"
                  busy={a.busy}
                  onPress={() =>
                    void a.run(async () => {
                      await repository().manageGroupMember(group.id, selected.id, action);
                      await refresh();
                      setSelected(null);
                    })
                  }
                />
              ),
            )}
          </>
        )}
        {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
        <Button label={t('common.cancel')} variant="secondary" onPress={() => setSelected(null)} />
      </ActionSheet>
    </>
  );
}
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const cache = useQueryClient();
  const focused = useIsFocused();
  const a = useAction();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['group', id], queryFn: () => repository().group(id) });
  useEffect(() => {
    if (!focused) return;
    return repository().subscribe(id, () => {
      void cache.invalidateQueries({ queryKey: ['group', id] });
    });
  }, [id, cache, focused]);
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['group', id] });
    await cache.invalidateQueries({ queryKey: ['conversations'] });
  }
  return (
    <Page
      title={q.isError ? t('groups.details') : (q.data?.title ?? t('groups.details'))}
      titleLines={2}
      back
    >
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        q.data && <GroupControls key={q.data.title} group={q.data} refresh={refresh} />
      )}
      <Button label={t('groups.leave')} variant="secondary" onPress={() => setConfirm(true)} />
      {confirm && (
        <>
          <AppText>{t('groups.leaveConfirm')}</AppText>
          <Button
            label={t('groups.confirmLeave')}
            busy={a.busy}
            onPress={() =>
              void a.run(async () => {
                await repository().leaveGroup(id);
                cache.removeQueries({ queryKey: ['messages', id] });
                cache.removeQueries({ queryKey: ['group', id] });
                cache.removeQueries({ queryKey: ['attachment'] });
                await cache.invalidateQueries({ queryKey: ['conversations'] });
                router.replace('/(tabs)/chats');
              })
            }
          />
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => setConfirm(false)}
          />
        </>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </Page>
  );
}
