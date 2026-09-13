import { useState, useSyncExternalStore } from 'react';
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
  const { engine } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const q = useQuery({
    queryKey: ['device', 'contact-card', key],
    enabled: peerKey.safeParse(key).success,
    networkMode: 'always',
    queryFn: async () => {
      const contact = (await engine.contacts()).find((row) => row.key === key && !row.blocked);
      if (!contact) throw new Error('CONTACT_UNAVAILABLE');
      return { contact, profile: await engine.contactProfile(key) };
    },
  });
  return (
    <Page title={t('card.view')} back>
      {q.data ? (
        <>
          <ContactCard name={q.data.contact.name} profile={q.data.profile ?? emptyProfile()} />
          {q.data.profile ? (
            <CardDetails profile={q.data.profile} />
          ) : (
            <AppText tone="secondary">{t('card.noCard')}</AppText>
          )}
          <Button
            label={t('card.message')}
            onPress={() =>
              void action.run(async () => {
                if (!(await engine.acceptsPeer(key))) throw new Error('CONTACT_BLOCKED');
                const id = await engine.trustContact({ key, name: q.data!.contact.name });
                router.push({ pathname: '/chat/[id]', params: { id } });
              })
            }
          />
          <Button
            variant="secondary"
            label={t('card.qr')}
            onPress={() => router.push('/my-code')}
          />
          <Section title={t('card.key')}>
            <AppText selectable variant="caption">
              {key}
            </AppText>
          </Section>
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
