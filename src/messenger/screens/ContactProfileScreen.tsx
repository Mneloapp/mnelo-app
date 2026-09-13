import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Field, Page, Section, StateView } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { invitationSnapshot, observeInvitation, setInvitation } from '../pending-invitation';
import { CardDetails, ContactCard } from '../components/ContactCard';
import { emptyProfile } from '../local-profile';
import { peerKey } from '../model';
import { Check, useLocalAction } from './shared';
import type { ContactInvitation } from '../contact-link';
import { SheetAction } from '@/components/SheetAction';
import { PhonebookAccess } from '../components/PhonebookAccess';
import {
  ContactHero,
  ContactAction,
  ChatPrivacyActions,
  InfoGroup,
  infoStyles,
} from '../components/ContactInfo';
import { avatarUri } from '../profile-avatar';
import { ProfileGroup, ProfileRow, profileStyles } from '../components/OwnProfile';
import { directChatId } from '../crypto';
import { CurrentCall, useCurrentCall } from './CallActions';

export function ContactInvitationScreen() {
  const invitation = useSyncExternalStore(
    observeInvitation,
    invitationSnapshot,
    invitationSnapshot,
  );
  return <InvitationPreview key={invitation?.key ?? 'empty'} invitation={invitation} />;
}
function InvitationPreview({ invitation }: { invitation: ContactInvitation | null }) {
  const { engine, identity, authenticated } = useDevice();
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false),
    [name, setName] = useState(invitation?.name ?? '');
  const action = useLocalAction();
  if (!invitation)
    return (
      <Page title={t('card.view')} back>
        <StateView message={t('card.invalidCode')} />
      </Page>
    );
  return (
    <Page title={t('card.view')} back nativeKeyboardInsets>
      <ContactCard name={invitation.name} profile={emptyProfile()} />
      {!authenticated ? (
        <>
          <AppText>{t('card.joinHint')}</AppText>
          <Button label={t('card.register')} onPress={() => router.push('/identity')} />
        </>
      ) : invitation.key === identity?.key ? (
        <AppText>{t('card.samePerson')}</AppText>
      ) : (
        <>
          <Field
            label={t('messenger.contactName')}
            value={name}
            maxLength={60}
            onChangeText={setName}
          />
          <Section title={t('card.key')}>
            <AppText selectable variant="caption">
              {invitation.key}
            </AppText>
          </Section>
          <AppText variant="caption" tone="secondary">
            {t('card.verify')}
          </AppText>
          <Check value={confirmed} label={t('card.confirmed')} onChange={setConfirmed} />
          <Button
            label={t('card.add')}
            busy={action.busy}
            disabled={!confirmed || !name.trim()}
            onPress={() =>
              void action.run(async () => {
                const contact = (await engine.contacts()).find((row) => row.key === invitation.key);
                if (contact?.blocked) throw new Error('CONTACT_BLOCKED');
                await engine.trustContact({ key: invitation.key, name: name.trim() });
                setInvitation(null);
                router.replace({ pathname: '/contact/[key]', params: { key: invitation.key } });
              })
            }
          />
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
export function ContactProfileScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { engine, view, identity, calls, mesh } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const currentCall = useCurrentCall();
  const [details, setDetails] = useState(false);
  const [cleared, setCleared] = useState(false);
  const q = useQuery({
    queryKey: ['device', 'contact-card', key],
    enabled: peerKey.safeParse(key).success,
    networkMode: 'always',
    queryFn: async () => {
      const contact = (await view.contacts()).find((row) => row.key === key);
      if (!contact) throw new Error('CONTACT_UNAVAILABLE');
      return { contact, profile: await engine.contactProfile(key) };
    },
  });
  const contact = q.data?.contact;
  const profile = q.data?.profile;
  const chatId = identity && contact ? directChatId(identity.key, contact.key) : null;
  const canCall = Boolean(
    contact &&
    !contact.blocked &&
    calls &&
    !currentCall &&
    (calls.supportsQueuedSignaling || mesh?.online(key)),
  );
  useEffect(() => {
    if (contact && !contact.blocked) void mesh?.focus(contact.key).catch(() => undefined);
  }, [contact, mesh]);
  function open(media?: 'voice' | 'video') {
    void action.run(async () => {
      if (!chatId || !(await engine.acceptsPeer(key))) return;
      if (media) {
        if (!calls || !canCall) return;
        await calls.start(key, media);
        router.push({ pathname: '/call/[id]', params: { id: chatId } });
      } else {
        router.dismissTo({ pathname: '/chat/[id]', params: { id: chatId } });
      }
    });
  }
  return (
    <Page title={t('card.info')} back contentStyle={profileStyles.content}>
      {contact ? (
        <>
          <ContactHero
            name={contact.name}
            uri={avatarUri(profile?.avatar ?? '')}
            subtitle={contact.phone || (profile?.username ? '@' + profile.username : undefined)}
            about={profile?.headline}
          />
          <CurrentCall />
          <View style={infoStyles.actions}>
            <ContactAction
              icon="message-circle"
              label={t('card.message')}
              disabled={action.busy || contact.blocked || !chatId}
              onPress={() => open()}
            />
            <ContactAction
              icon="phone"
              label={t('messenger.callVoice')}
              disabled={action.busy || !canCall}
              onPress={() => open('voice')}
            />
            <ContactAction
              icon="video"
              label={t('messenger.callVideo')}
              disabled={action.busy || !canCall}
              onPress={() => open('video')}
            />
          </View>
          {chatId && (
            <ProfileGroup>
              <ProfileRow
                icon="image"
                label={t('library.title')}
                last
                onPress={() => router.push({ pathname: '/shared/[id]', params: { id: chatId } })}
              />
            </ProfileGroup>
          )}
          {profile?.about ? (
            <InfoGroup>
              <AppText>{profile.about}</AppText>
            </InfoGroup>
          ) : null}
          {contact.phone && !contact.blocked && <PhonebookAccess grouped />}
          {profile && (profile.email || profile.website) ? (
            <InfoGroup>
              <CardDetails profile={profile} />
            </InfoGroup>
          ) : null}
          <InfoGroup>
            <SheetAction
              icon="shield"
              label={t('card.key')}
              onPress={() => setDetails((value) => !value)}
            />
            {details && (
              <AppText selectable variant="caption" tone="secondary">
                {key}
              </AppText>
            )}
          </InfoGroup>
          <ChatPrivacyActions
            busy={action.busy || !chatId}
            blocked={contact.blocked}
            onClear={() =>
              void action.run(async () => {
                if (!chatId) return;
                await engine.clearLocalHistory(chatId);
                setCleared(true);
              })
            }
            onBlock={() =>
              void action.run(async () => {
                await engine.block(key, !contact.blocked);
                await q.refetch();
              })
            }
          />
          {cleared && (
            <AppText variant="caption" tone="secondary" accessibilityLiveRegion="polite">
              {t('card.historyCleared')}
            </AppText>
          )}
        </>
      ) : (
        <StateView
          loading={q.isPending && peerKey.safeParse(key).success}
          error={q.isError ? t('messenger.genericError') : undefined}
          message={t('card.invalidCode')}
        />
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
