import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Page, Row, StateView } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { useDevice } from '../DeviceProvider';
import { Check, useLocalAction } from './shared';
import { ChatPrivacyActions } from '../components/ContactInfo';
import { ExportChatAction } from '../components/ExportChatAction';
import { GroupProfileFields } from '../components/GroupProfileFields';
import { groupProfile, readGroupProfile, type GroupProfile } from '../group-profile';
import { avatarUri } from '../profile-avatar';
import { CardDetails } from '../components/ContactCard';
import { emptyProfile } from '../local-profile';
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, identity, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [title, setTitle] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[] | undefined>();
  const [details, setDetails] = useState<GroupProfile | undefined>();
  const group = useQuery({
    queryKey: ['device', 'chat', id],
    queryFn: () => view.chat(id),
    networkMode: 'always',
  });
  const members = useQuery({
    queryKey: ['device', 'members', id],
    queryFn: () => view.members(id),
    networkMode: 'always',
  });
  const contacts = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const keys =
    selected ??
    members.data?.filter((member) => member.key !== identity?.key).map((member) => member.key) ??
    [];
  const owner = group.data?.owner === identity?.key;
  const profile = details ?? readGroupProfile(group.data);
  return (
    <Page title={group.data?.title ?? t('messenger.newGroup')} back>
      <AppText tone="secondary">{t('messenger.groupAdminHint')}</AppText>
      {owner ? (
        <>
          <GroupProfileFields
            name={title ?? group.data?.title ?? ''}
            onNameChange={setTitle}
            profile={profile}
            onChange={setDetails}
            busy={action.busy}
            onPhotoBusyChange={setPhotoBusy}
          />
          {contacts.data
            ?.filter((contact) => !contact.blocked)
            .map((contact) => (
              <Check
                key={contact.key}
                label={contact.name}
                value={keys.includes(contact.key)}
                onChange={(value) =>
                  setSelected(
                    value ? [...keys, contact.key] : keys.filter((key) => key !== contact.key),
                  )
                }
              />
            ))}
          <Button
            label={t('messenger.saveGroup')}
            busy={action.busy}
            disabled={
              photoBusy ||
              keys.length > 15 ||
              !(title ?? group.data?.title)?.trim() ||
              !groupProfile.safeParse(profile).success
            }
            onPress={() =>
              void action.run(() =>
                engine.updateGroup(
                  id,
                  title ?? group.data?.title ?? '',
                  keys,
                  groupProfile.parse(profile),
                ),
              )
            }
          />
        </>
      ) : (
        <>
          <Avatar
            group
            name={group.data?.title ?? ''}
            uri={avatarUri(profile.avatar)}
            size="profile"
          />
          {profile.headline ? <AppText variant="headline">{profile.headline}</AppText> : null}
          {profile.about ? <AppText tone="secondary">{profile.about}</AppText> : null}
          <CardDetails profile={{ ...emptyProfile(), ...profile }} />
          {members.data?.map((member) => (
            <Row
              key={member.key}
              title={member.key === identity?.key ? identity.name : member.name}
              left={<Avatar name={member.name} />}
            />
          ))}
          {group.data?.left_group ? (
            <AppText>{t('messenger.groupLeft')}</AppText>
          ) : (
            <Button
              variant="danger"
              label={t('messenger.leaveGroup')}
              busy={action.busy}
              onPress={() => void action.run(() => engine.leaveGroup(id))}
            />
          )}
        </>
      )}
      {group.data?.kind === 'group' && <ExportChatAction chatId={id} />}
      <ChatPrivacyActions
        busy={action.busy}
        onClear={() => void action.run(() => engine.clearLocalHistory(id))}
      />
      <StateView
        loading={members.isPending}
        error={action.error ?? (members.isError ? t('messenger.genericError') : undefined)}
      />
    </Page>
  );
}
