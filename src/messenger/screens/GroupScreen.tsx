import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, IconButton, Page, Row, StateView } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { SheetAction } from '@/components/SheetAction';
import { useDevice } from '../DeviceProvider';
import { useLocalAction } from './shared';
import {
  ChatPrivacyActions,
  ContactAction,
  InfoGroup,
  infoStyles,
} from '../components/ContactInfo';
import { ExportChatAction } from '../components/ExportChatAction';
import { readGroupProfile } from '../group-profile';
import { avatarUri } from '../profile-avatar';
import { fallbackAvatarColor } from '../avatar-color';
import { CardDetails, PeerAvatar } from '../components/ContactCard';
import { ProfileGroup, ProfileRow, profileStyles } from '../components/OwnProfile';
import { emptyProfile } from '../local-profile';
import { useCurrentCall } from './CallActions';

export function useGroupInfo(id: string) {
  const { view } = useDevice();
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
  return { group, members };
}
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, identity, calls, profile: ownProfile } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const { group, members } = useGroupInfo(id);
  const currentCall = useCurrentCall();
  const chat = group.data;
  const owner = chat?.owner === identity?.key && !chat?.left_group;
  const profile = readGroupProfile(chat);
  const edit = () => router.push({ pathname: '/edit-group/[id]', params: { id } });
  const inactive = Boolean(
    chat?.left_group ||
    (members.data && !members.data.some((member) => member.key === identity?.key)),
  );
  const canCall = Boolean(
    calls?.supportsQueuedSignaling && !currentCall && !inactive && (members.data?.length ?? 0) > 1,
  );
  return (
    <Page
      title={t('messenger.groupInfo')}
      back
      contentStyle={profileStyles.content}
      right={
        owner ? (
          <IconButton
            icon="edit-2"
            variant="soft"
            label={t('messenger.editGroup')}
            onPress={edit}
          />
        ) : undefined
      }
    >
      {chat?.kind === 'group' ? (
        <>
          <FocusPressable
            accessibilityRole={owner ? 'button' : undefined}
            accessibilityLabel={owner ? t('messenger.editGroup') : chat.title}
            disabled={!owner}
            onPress={edit}
            style={infoStyles.hero}
          >
            <Avatar
              group
              name={chat.title}
              uri={avatarUri(profile.avatar)}
              size="profile"
              fallbackRingColor={fallbackAvatarColor('group:' + id)}
            />
            <AppText variant="title" centered style={infoStyles.name}>
              {chat.title}
            </AppText>
            {members.data && (
              <AppText tone="secondary">
                {t('messenger.groupMembersCount', { count: members.data.length })}
              </AppText>
            )}
            {profile.about ? (
              <AppText centered tone="secondary">
                {profile.about}
              </AppText>
            ) : owner ? (
              <AppText tone="secondary">{t('messenger.groupAddDescription')}</AppText>
            ) : null}
          </FocusPressable>
          <View style={infoStyles.actions}>
            <ContactAction
              icon="message-circle"
              label={t('card.message')}
              onPress={() => router.dismissTo({ pathname: '/chat/[id]', params: { id } })}
            />
            <ContactAction
              icon="phone"
              label={t('messenger.callVoice')}
              disabled={!canCall}
              onPress={() =>
                router.push({ pathname: '/call/[id]', params: { id, media: 'voice' } })
              }
            />
            <ContactAction
              icon="video"
              label={t('messenger.callVideo')}
              disabled={!canCall}
              onPress={() =>
                router.push({ pathname: '/call/[id]', params: { id, media: 'video' } })
              }
            />
          </View>
          <ProfileGroup>
            <ProfileRow
              icon="image"
              label={t('library.title')}
              last
              onPress={() => router.push({ pathname: '/shared/[id]', params: { id } })}
            />
          </ProfileGroup>
          {profile.headline || profile.email || profile.website ? (
            <InfoGroup>
              {profile.headline ? <AppText>{profile.headline}</AppText> : null}
              <CardDetails profile={{ ...emptyProfile(), ...profile }} />
            </InfoGroup>
          ) : null}
          <InfoGroup>
            <AppText variant="headline">{t('messenger.groupMembers')}</AppText>
            {owner && (
              <SheetAction
                icon="user-plus"
                label={t('messenger.groupAddMembers')}
                disabled={action.busy || !members.data || members.data.length >= 16}
                onPress={() => router.push({ pathname: '/group-members/[id]', params: { id } })}
              />
            )}
            {members.data?.map((member) => (
              <Row
                key={member.key}
                title={member.key === identity?.key ? t('messenger.groupYou') : member.name}
                subtitle={member.key === chat.owner ? t('messenger.groupAdmin') : undefined}
                left={
                  member.key === identity?.key ? (
                    <Avatar
                      name={identity.name}
                      uri={avatarUri(ownProfile?.avatar ?? '')}
                      fallbackRingColor={fallbackAvatarColor('peer:' + member.key)}
                    />
                  ) : (
                    <PeerAvatar peer={member.key} name={member.name} colorfulFallback />
                  )
                }
                right={
                  owner && member.key !== identity?.key ? (
                    <IconButton
                      icon="user-minus"
                      label={t('messenger.groupRemovePerson', { name: member.name })}
                      disabled={action.busy}
                      onPress={() =>
                        Alert.alert(
                          t('messenger.groupRemovePerson', { name: member.name }),
                          t('messenger.groupRemoveHint'),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('messenger.groupRemove'),
                              style: 'destructive',
                              onPress: () =>
                                void action.run(() =>
                                  engine.changeGroupMembers(id, { remove: member.key }),
                                ),
                            },
                          ],
                        )
                      }
                    />
                  ) : undefined
                }
              />
            ))}
          </InfoGroup>
          <ExportChatAction chatId={id} />
          {!owner && !inactive && (
            <InfoGroup>
              <SheetAction
                icon="log-out"
                danger
                label={t('messenger.leaveGroup')}
                disabled={action.busy}
                onPress={() =>
                  Alert.alert(t('messenger.leaveGroup'), t('messenger.groupLeaveHint'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('messenger.leaveGroup'),
                      style: 'destructive',
                      onPress: () => void action.run(() => engine.leaveGroup(id)),
                    },
                  ])
                }
              />
            </InfoGroup>
          )}
          {chat.left_group ? <AppText tone="secondary">{t('messenger.groupLeft')}</AppText> : null}
          <ChatPrivacyActions
            busy={action.busy}
            onClear={() => void action.run(() => engine.clearLocalHistory(id))}
          />
        </>
      ) : null}
      {group.isPending || members.isPending || action.error || group.isError || members.isError ? (
        <StateView
          loading={group.isPending || members.isPending}
          error={
            action.error ??
            (group.isError || members.isError ? t('messenger.genericError') : undefined)
          }
        />
      ) : null}
    </Page>
  );
}
