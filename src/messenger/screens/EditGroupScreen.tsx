import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton, Page, StateView } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { GroupProfileFields } from '../components/GroupProfileFields';
import { groupProfile, readGroupProfile, type GroupProfile } from '../group-profile';
import { useLocalAction } from './shared';
import { useGroupInfo } from './GroupScreen';

export function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, identity } = useDevice();
  const { t } = useTranslation();
  const { group } = useGroupInfo(id);
  const action = useLocalAction();
  const [name, setName] = useState<string>();
  const [details, setDetails] = useState<GroupProfile>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const title = name ?? group.data?.title ?? '';
  const profile = details ?? readGroupProfile(group.data);
  const owner = group.data?.owner === identity?.key && !group.data?.left_group;
  return (
    <Page
      title={t('messenger.editGroup')}
      back
      nativeKeyboardInsets
      right={
        owner ? (
          <IconButton
            icon="check"
            label={t('messenger.saveGroup')}
            disabled={
              action.busy || photoBusy || !title.trim() || !groupProfile.safeParse(profile).success
            }
            onPress={() =>
              void action.run(async () => {
                await engine.editGroupProfile(id, title, groupProfile.parse(profile));
                router.back();
              })
            }
          />
        ) : undefined
      }
    >
      {owner && (
        <GroupProfileFields
          name={title}
          onNameChange={setName}
          profile={profile}
          onChange={setDetails}
          busy={action.busy}
          onPhotoBusyChange={setPhotoBusy}
        />
      )}
      {group.isPending || action.error || group.isError || !owner ? (
        <StateView
          loading={group.isPending}
          error={
            action.error ??
            (group.isError || (!group.isPending && !owner)
              ? t('messenger.genericError')
              : undefined)
          }
        />
      ) : null}
    </Page>
  );
}
