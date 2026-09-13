import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Field, Page, Row, StateView } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { useDevice } from '../DeviceProvider';
import { Check, useLocalAction } from './shared';
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, identity, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [title, setTitle] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[] | undefined>();
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
  return (
    <Page title={group.data?.title ?? t('messenger.newGroup')} back>
      <AppText tone="secondary">{t('messenger.groupAdminHint')}</AppText>
      {owner ? (
        <>
          <Field
            label={t('messenger.groupName')}
            value={title ?? group.data?.title ?? ''}
            onChangeText={setTitle}
            maxLength={80}
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
            disabled={keys.length > 15}
            onPress={() =>
              void action.run(() => engine.updateGroup(id, title ?? group.data?.title ?? '', keys))
            }
          />
        </>
      ) : (
        <>
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
      <StateView
        loading={members.isPending}
        error={action.error ?? (members.isError ? t('messenger.genericError') : undefined)}
      />
    </Page>
  );
}
