import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Page, StateView } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { formatDate, formatTime } from '@/i18n/format';
import { useDevice } from '../DeviceProvider';
import { DeliveryLeaf } from '../components/MessageMetadata';
import { PeerAvatar } from '../components/ContactCard';
import { presentSharedContact } from '../contact-share';
import type { MessageInfo, MessageRecipientInfo } from '../message-info';
import { ChatMessageBubble } from '../components/ChatMessageBubble';
import type { LocalMessage } from '../model';

function receiptTime(time: number | null) {
  if (time === null) return '—';
  const instant = new Date(time).toISOString();
  return `${formatDate(instant)} · ${formatTime(instant)}`;
}

export function MessageReceiptDetails({ info }: { info: MessageInfo }) {
  const { t } = useTranslation();
  if (!info.recipients.length)
    return (
      <View style={styles.card}>
        <AppText style={styles.empty} tone="secondary">
          {t('messenger.receiptHistoryUnavailable')}
        </AppText>
      </View>
    );
  if (info.kind === 'direct') {
    const recipient = info.recipients[0];
    return (
      <View style={styles.card}>
        {(['read', 'delivered'] as const).map((status, index) => (
          <View key={status} style={[styles.directRow, index > 0 && styles.divider]}>
            <DeliveryLeaf status={status} />
            <AppText style={styles.label}>
              {t(status === 'read' ? 'messenger.receiptRead' : 'messenger.receiptDelivered')}
            </AppText>
            <AppText variant="caption" tone="secondary" style={styles.directTime}>
              {receiptTime(
                (status === 'read' ? recipient?.readAt : recipient?.deliveredAt) ?? null,
              )}
            </AppText>
          </View>
        ))}
      </View>
    );
  }
  const sections = [
    { status: 'read', title: t('messenger.readBy') },
    { status: 'delivered', title: t('messenger.deliveredTo') },
    { status: 'pending', title: t('messenger.deliveryPending') },
  ] as const;
  return (
    <View style={styles.sections}>
      {sections.map(({ status, title }) => {
        const recipients = info.recipients.filter((person) => person.status === status);
        if (status === 'pending' && !recipients.length) return null;
        return (
          <View key={status} style={styles.section}>
            <View style={styles.heading}>
              <DeliveryLeaf status={status} />
              <AppText variant="label" tone="secondary" accessibilityRole="header">
                {title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {recipients.length}
              </AppText>
            </View>
            <View style={styles.card}>
              {recipients.length ? (
                recipients.map((person, index) => (
                  <RecipientRow key={person.peer} person={person} separated={index > 0} />
                ))
              ) : (
                <AppText style={styles.empty} tone="secondary">
                  {t('messenger.noReceiptsYet')}
                </AppText>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RecipientRow({ person, separated }: { person: MessageRecipientInfo; separated: boolean }) {
  const { t } = useTranslation();
  const name = person.name || t('messenger.contact');
  return (
    <View style={[styles.recipient, separated && styles.divider]}>
      <PeerAvatar peer={person.peer} name={name} size="small" />
      <View style={styles.person}>
        <AppText>{name}</AppText>
        <AppText variant="caption" tone="secondary">
          {person.status === 'pending'
            ? t('messenger.deliveryPending')
            : receiptTime(person.status === 'read' ? person.readAt : person.deliveredAt)}
        </AppText>
      </View>
    </View>
  );
}

export function MessageInfoScreen() {
  const { id, chat } = useLocalSearchParams<{ id: string; chat: string }>();
  return <MessageInfoContent id={id} chat={chat} />;
}

export function MessageInfoContent({
  id,
  chat,
  preview,
  onBack,
}: {
  id: string;
  chat: string;
  preview?: LocalMessage;
  onBack?: () => void;
}) {
  const { view } = useDevice();
  const { t } = useTranslation();
  const info = useQuery({
    queryKey: ['device', 'message-info', chat, id],
    queryFn: () => view.messageInfo(chat, id),
    enabled: Boolean(chat && id),
    networkMode: 'always',
  });
  const contacts = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const message = info.data?.message ?? (info.isPending ? preview : undefined);
  return (
    <Page title={t('messenger.messageInfo')} back onBack={onBack} contentStyle={styles.page}>
      {message ? (
        <>
          <View style={styles.preview}>
            <AppText variant="caption" tone="secondary" style={styles.date}>
              {formatDate(new Date(message.sentAt).toISOString())}
            </AppText>
            <ChatMessageBubble
              message={presentSharedContact(message, contacts.data ?? [])}
              onSelect={() => {}}
              onReply={() => {}}
              menuOpen
            />
          </View>
          {info.data ? (
            <MessageReceiptDetails info={info.data} />
          ) : (
            <StateView
              loading={info.isPending}
              error={info.isError ? t('messenger.genericError') : undefined}
              message={t('messenger.messageInfoUnavailable')}
            />
          )}
        </>
      ) : (
        <StateView
          loading={info.isPending}
          error={info.isError ? t('messenger.genericError') : undefined}
          message={t('messenger.messageInfoUnavailable')}
        />
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xl },
  preview: { gap: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  date: { textAlign: 'center' },
  sections: { gap: theme.spacing.xl },
  section: { gap: theme.spacing.sm },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing.lg,
    overflow: 'hidden',
  },
  directRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  label: { flexGrow: 1 },
  directTime: { flexShrink: 1 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  recipient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  person: { flex: 1, gap: theme.spacing.xs },
  empty: { paddingVertical: theme.spacing.lg },
});
