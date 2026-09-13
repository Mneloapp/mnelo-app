import { formatTime } from '@/i18n/format';
import { ActionSheet } from '@/components/ActionSheet';
import { FocusPressable } from '@/components/FocusPressable';
import { messageOutbox } from '@/services/message-outbox';
import { callEventLabel } from '@/features/calls/call-copy';
import { StartCall } from '@/features/calls/StartCall';
import { AttachmentContent } from './AttachmentContent';
import * as Crypto from 'expo-crypto';
import { useSendMessage } from './useSendMessage';
import { usePendingMessages } from './pending-messages';
import { useDebounced } from '@/hooks/useDebounced';
import { loadRecentPeople } from './recent-people';
import { useEffect, useState, useMemo, memo } from 'react';
import {
  FlatList,
  View,
  Share,
  Pressable,
  StyleSheet,
  AppState,
  Linking,
  Platform,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { router, useLocalSearchParams, useIsFocused } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { MessageField } from './MessageField';
import {
  Avatar,
  Button,
  Field,
  IconButton,
  Page,
  Row,
  Section,
  StateView,
  ui,
} from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { useConversations, useMessages } from '@/hooks/useRepository';
import { repository } from '@/services';
import { useSession } from '@/stores/session';
import type { Message } from '@/types/domain';
import { theme as theme } from '@/theme/tokens';
const messageViewability = { itemVisiblePercentThreshold: 70 };
function navigateChat(id: string) {
  router.push({ pathname: '/chat/[id]', params: { id } });
}
export function ChatsScreen() {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const q = useConversations();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const items = (q.data ?? [])
    .map((c) => ({ ...c, title: c.title.trim() || t('chats.unavailableAccount') }))
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <Page
      bottomSafe={false}
      title={t('brand')}
      scroll={false}
      right={
        <View style={chatStyles.headerActions}>
          <IconButton
            label={t('common.search')}
            icon="search"
            onPress={() => setSearching((s) => !s)}
          />
          <IconButton
            label={t('chats.newMessage')}
            icon="edit"
            onPress={() => router.push('/new-message')}
          />
        </View>
      }
    >
      {searching && (
        <Field label={t('common.search')} value={search} onChangeText={setSearch} autoFocus />
      )}
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          style={ui.flex}
          contentContainerStyle={items.length === 0 ? ui.grow : undefined}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          data={items}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: c }) => (
            <Row
              title={c.title}
              stackRight={fontScale >= 1.4}
              accessibilityLabel={t('chats.conversationSummary', {
                name: c.title,
                preview:
                  (c.previewKind === 'call' ? callEventLabel(c.preview, t) : c.preview) ||
                  (c.previewKind ? t(`chat.preview.${c.previewKind}`) : t('chats.noMessages')),
                time: formatTime(c.updatedAt),
                unread: t('chats.unread', { count: c.unreadCount }),
              })}
              subtitle={
                (c.previewKind === 'call' ? callEventLabel(c.preview, t) : c.preview) ||
                (c.previewKind ? t(`chat.preview.${c.previewKind}`) : t('chats.noMessages'))
              }
              left={<Avatar name={c.title} />}
              right={
                <View style={ui.stack}>
                  <AppText variant="caption" tone="secondary">
                    {formatTime(c.updatedAt)}
                  </AppText>
                  {c.unreadCount > 0 && (
                    <View style={chatStyles.unread}>
                      <AppText
                        variant="caption"
                        accessibilityLabel={t('chats.unread', { count: c.unreadCount })}
                      >
                        {c.unreadCount > 99 ? '99+' : c.unreadCount}
                      </AppText>
                    </View>
                  )}
                </View>
              }
              onPress={() => navigateChat(c.id)}
            />
          )}
          ListEmptyComponent={<StateView message={t('chats.empty')} />}
        />
      )}
    </Page>
  );
}
export function NewMessageScreen() {
  const { t } = useTranslation();
  const userId = useSession((s) => s.session?.userId);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const q = useQuery({
    queryKey: ['people', userId, debounced],
    queryFn: () =>
      debounced.trim()
        ? repository().searchProfiles(debounced)
        : loadRecentPeople(repository(), userId!),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });
  const a = useAction();
  return (
    <Page title={t('chats.newMessage')} back>
      <Field
        label={t('chats.searchPeople')}
        placeholder={t('chats.searchPeople')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      <Row
        title={t('groups.new')}
        onPress={() => router.push('/new-group')}
        left={<AppIcon name="users" />}
        right={<AppIcon name="chevron-right" />}
      />
      <Row
        title={t('chats.invite')}
        left={<AppIcon name="user-plus" />}
        onPress={() => void Share.share({ message: t('chats.invitation') })}
      />
      <Section title={t(debounced.trim() ? 'common.search' : 'chats.recent')}>
        {q.isPending ? (
          <StateView loading />
        ) : q.isError ? (
          <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
        ) : q.data?.length ? (
          q.data.map((p) => (
            <Row
              key={p.id}
              title={p.displayName}
              subtitle={'@' + p.username}
              left={<Avatar name={p.displayName} />}
              onPress={() => {
                void a.run(async () => {
                  const state = await repository().relationship(p.id);
                  if (state.connected)
                    navigateChat(await repository().openDirectConversation(p.id));
                  else router.push({ pathname: '/profile/[id]', params: { id: p.id } });
                });
              }}
            />
          ))
        ) : (
          <StateView message={t(debounced.trim() ? 'chats.noPeopleFound' : 'common.empty')} />
        )}
      </Section>
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      <Section title={t('chats.contacts')}>
        <AppText tone="secondary">{t('chats.contactsOptIn')}</AppText>
        <Button
          variant="secondary"
          label={t('chats.chooseContacts')}
          onPress={() => router.push('/media?kind=contacts')}
        />
      </Section>
    </Page>
  );
}
function MessageContent({ message: m }: { message: Message }) {
  const { t } = useTranslation();
  if (m.deletedAt) return <AppText tone="secondary">{t('chat.deleted')}</AppText>;
  switch (m.kind) {
    case 'image':
    case 'file':
    case 'voice':
      return <AttachmentContent message={m} />;
    case 'location':
      return (
        <View style={ui.stack}>
          <Row title={t('chat.location')} subtitle={m.location?.label ?? m.text} />
          {m.location && (
            <Button
              variant="secondary"
              label={t('media.openMap')}
              onPress={() => {
                const coords = `${m.location!.latitude},${m.location!.longitude}`;
                void Linking.openURL(
                  Platform.OS === 'ios'
                    ? `https://maps.apple.com/?ll=${coords}`
                    : `https://www.google.com/maps/search/?api=1&query=${coords}`,
                );
              }}
            />
          )}
        </View>
      );
    case 'contact':
      return (
        <View style={ui.stack}>
          <AppText variant="bodyMedium">{m.contact?.name ?? t('chat.contact')}</AppText>
          <AppText variant="caption" tone="secondary">
            {m.contact ? '@' + m.contact.username : m.text}
          </AppText>
        </View>
      );
    case 'call':
      return <AppText>{callEventLabel(m.text, t)}</AppText>;
    default:
      return <AppText>{m.text}</AppText>;
  }
}
const MessageBubble = memo(function MessageBubble({
  message: m,
  userId,
  isGroup,
  memberName,
  onSelect,
}: {
  message: Message;
  userId?: string | undefined;
  isGroup: boolean;
  memberName?: string | undefined;
  onSelect: (message: Message) => void;
}) {
  const { t } = useTranslation();
  const a = useAction();
  return (
    <Pressable
      accessible={false}
      focusable={false}
      tabIndex={-1}
      onLongPress={() => onSelect(m)}
      style={[
        chatStyles.bubble,
        !m.deletedAt && !['text', 'call'].includes(m.kind) && chatStyles.mediaBubble,
        m.senderId === userId ? chatStyles.outgoing : chatStyles.incoming,
      ]}
    >
      {isGroup && m.senderId !== userId && (
        <AppText variant="caption" tone="secondary">
          {memberName ?? t('groups.formerMember')}
        </AppText>
      )}
      {m.replyTo && (
        <AppText variant="caption" tone="secondary">
          {t('chat.reply')}
        </AppText>
      )}
      <MessageContent message={m} />
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      {m.status === 'failed' && (
        <Button
          variant="secondary"
          label={t('common.retry')}
          onPress={() => void a.run(() => messageOutbox.retry(m.clientId))}
        />
      )}
      {m.reactions.length > 0 && (
        <AppText variant="caption">{m.reactions.map((r) => r.emoji).join(' ')}</AppText>
      )}
      <FocusPressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.actionsFor', {
          message: m.deletedAt
            ? t('chat.deleted')
            : m.kind === 'text'
              ? m.text.slice(0, 80)
              : t(`chat.preview.${m.kind}`),
          time: formatTime(m.createdAt),
        })}
        onPress={() => onSelect(m)}
        style={{ minHeight: theme.controls.minTapTarget, justifyContent: 'center' }}
      >
        <AppText variant="caption" tone="secondary">
          {formatTime(m.createdAt)} ·{' '}
          {t(`chat.status.${m.senderId === userId && m.readBy?.length ? 'read' : m.status}`)} · …
        </AppText>
      </FocusPressable>
    </Pressable>
  );
});
export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const userId = useSession((s) => s.session?.userId);
  const q = useMessages(id);
  const metadata = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => repository().conversation(id),
  });
  const chat = metadata.data;
  const group = useQuery({
    queryKey: ['group', id],
    queryFn: () => repository().group(id),
    enabled: chat?.kind === 'group',
  });
  const [text, setText] = useState('');
  const [callError, setCallError] = useState<string>();
  const [reply, setReply] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [attachments, setAttachments] = useState(false);
  const a = useAction();
  const cache = useQueryClient();
  const sender = useSendMessage(id);
  const pending = usePendingMessages((s) => s.items);
  const outboxFailed = usePendingMessages((s) => s.storageFailed);
  const serverItems = useMemo(() => q.data?.items ?? [], [q.data?.items]);
  const items = useMemo(() => {
    const ids = new Set(serverItems.map((m) => m.clientId));
    return [
      ...pending.filter(
        (m) => m.conversationId === id && m.senderId === userId && !ids.has(m.clientId),
      ),
      ...serverItems,
    ];
  }, [serverItems, pending, id, userId]);
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [visibleMessage, setVisibleMessage] = useState<string>();
  const [viewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken<Message>[] }) => {
        const visible = viewableItems
          .filter((v) => v.isViewable && v.item.status === 'sent')
          .map((v) => v.item)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
        setVisibleMessage(visible[0]?.id);
      },
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    for (const m of pending)
      if (m.conversationId === id && serverItems.some((s) => s.clientId === m.clientId))
        usePendingMessages.getState().remove(m.id);
  }, [pending, serverItems, id]);
  useEffect(() => {
    if (!visibleMessage || !focused || !foreground) return;
    void repository()
      .markRead(id, visibleMessage)
      .then(() => {
        setReading(false);
        return cache.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => setReading(true));
  }, [id, visibleMessage, cache, focused, foreground, q.ready]);
  const peer = chat?.memberIds.find((p) => p !== userId);
  return (
    <Page
      title={chat ? chat.title.trim() || t('chats.unavailableAccount') : t('tabs.chats')}
      avatarName={chat?.title}
      titleLines={2}
      back
      scroll={false}
      right={
        <View style={chatStyles.headerActions}>
          {chat?.kind === 'direct' && (
            <>
              <StartCall conversation={id} video={false} onError={setCallError} />
              <StartCall conversation={id} video={true} onError={setCallError} />
            </>
          )}
          <IconButton
            label={t('common.more')}
            icon="more-horizontal"
            onPress={() =>
              chat?.kind === 'group'
                ? router.push({ pathname: '/group/[id]', params: { id } })
                : peer && router.push({ pathname: '/connection/[id]', params: { id } })
            }
          />
        </View>
      }
    >
      {callError && <AppText accessibilityRole="alert">{callError}</AppText>}
      {outboxFailed && <AppText accessibilityRole="alert">{t('chat.outboxUnavailable')}</AppText>}
      {q.isError && items.length > 0 && (
        <AppText accessibilityRole="alert">{t('chat.refreshUnavailable')}</AppText>
      )}
      {q.isPending && !items.length ? (
        <StateView loading />
      ) : q.isError && !items.length ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : !items.length ? (
        <StateView message={t('chats.noMessages')} />
      ) : (
        <FlatList
          style={ui.flex}
          inverted
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          data={items}
          onViewableItemsChanged={viewable}
          viewabilityConfig={messageViewability}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={q.isFetchingNextPage ? <StateView loading /> : null}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: m }) => (
            <MessageBubble
              message={m}
              userId={userId}
              isGroup={chat?.kind === 'group'}
              memberName={
                group.data?.members.find((member) => member.id === m.senderId)?.displayName
              }
              onSelect={setSelected}
            />
          )}
        />
      )}
      {!q.ready && repository().mode === 'supabase' && (
        <AppText variant="caption" tone="secondary">
          {t('chat.reconnecting')}
        </AppText>
      )}
      {reading && (
        <AppText variant="caption" tone="secondary">
          {t('chat.readRetry')}
        </AppText>
      )}
      {reply && (
        <Row
          title={t('chat.reply')}
          subtitle={reply.text}
          right={<IconButton label={t('common.cancel')} icon="x" onPress={() => setReply(null)} />}
        />
      )}
      {a.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {a.error}
        </AppText>
      )}
      <View style={chatStyles.composerRow}>
        <IconButton label={t('chat.attach')} icon="plus" onPress={() => setAttachments(true)} />
        <View style={ui.flex}>
          <MessageField value={text} onChangeText={setText} />
        </View>
        {text.trim() ? (
          <IconButton
            variant="connect"
            icon="arrow-up"
            label={t('common.send')}
            busy={a.busy}
            onPress={() => {
              const body = text;
              const replyId = reply?.id;
              void a.run(
                () => sender.send(body, replyId),
                () => {
                  setText((current) => (current === body ? '' : current));
                  setReply(null);
                },
              );
            }}
          />
        ) : (
          <IconButton
            label={t('chat.voiceMessage')}
            icon="mic"
            onPress={() =>
              router.push({ pathname: '/media', params: { kind: 'voice', conversationId: id } })
            }
          />
        )}
      </View>
      <ActionSheet
        title={t(attachments ? 'chat.attach' : 'chat.messageActions')}
        visible={Boolean(selected) || attachments}
        onClose={() => {
          setSelected(null);
          setAttachments(false);
        }}
      >
        {attachments ? (
          <>
            {(['image', 'file', 'voice', 'location', 'contact'] as const).map((kind) => (
              <Row
                key={kind}
                title={t(`chat.kinds.${kind}`)}
                left={<AppIcon name={attachmentIcons[kind]} />}
                onPress={() => {
                  setAttachments(false);
                  router.push({ pathname: '/media', params: { kind, conversationId: id } });
                }}
              />
            ))}
          </>
        ) : (
          selected && (
            <>
              <Row
                left={<AppIcon name="corner-up-left" />}
                title={t('chat.reply')}
                disabled={selected.status !== 'sent'}
                onPress={() => {
                  setReply(selected);
                  setSelected(null);
                }}
              />
              <Row
                left={<AppIcon name="smile" />}
                title={t('chat.react')}
                disabled={selected.status !== 'sent'}
                onPress={() => {
                  void a.run(() => repository().react(selected.id, '👍'));
                  setSelected(null);
                }}
              />
              <Row
                left={<AppIcon name="copy" />}
                title={t('chat.copy')}
                onPress={() => {
                  void Clipboard.setStringAsync(selected.text);
                  setSelected(null);
                }}
              />
              <Row
                left={<AppIcon name="corner-up-right" />}
                title={t('chat.forward')}
                disabled={selected.status !== 'sent'}
                onPress={() => {
                  setSelected(null);
                  router.push({
                    pathname: '/forward',
                    params: { messageId: selected.id, conversationId: id },
                  });
                }}
              />
              {selected.senderId && selected.senderId !== userId && !selected.deletedAt && (
                <Row
                  left={<AppIcon name="flag" />}
                  title={t('moderation.reportMessage')}
                  onPress={() => {
                    router.push({
                      pathname: '/report/[id]',
                      params: { id: selected.senderId, messageId: selected.id },
                    });
                    setSelected(null);
                  }}
                />
              )}
              {selected.senderId === userId && (
                <Button
                  variant="danger"
                  label={t(selected.status === 'sent' ? 'common.delete' : 'chat.removePending')}
                  onPress={() => {
                    void a.run(() =>
                      selected.status === 'sent'
                        ? repository().deleteMessage(selected.id)
                        : sender.discard(selected),
                    );
                    setSelected(null);
                  }}
                />
              )}
              {selected.status !== 'sent' && (
                <AppText variant="caption">{t('chat.removePendingNotice')}</AppText>
              )}
            </>
          )
        )}
        <Button
          variant="secondary"
          label={t('common.cancel')}
          onPress={() => {
            setSelected(null);
            setAttachments(false);
          }}
        />
      </ActionSheet>
    </Page>
  );
}
export function ForwardScreen() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const { t } = useTranslation();
  const q = useConversations();
  const a = useAction();
  const [clientId] = useState(() => Crypto.randomUUID());
  return (
    <Page title={t('chat.forward')} back>
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
      {q.isPending ? (
        <StateView loading />
      ) : q.isError ? (
        <StateView error={t('common.loadError')} onRetry={() => void q.refetch()} />
      ) : (
        q.data?.map((c) => (
          <Row
            key={c.id}
            title={c.title.trim() || t('chats.unavailableAccount')}
            onPress={() =>
              void a.run(
                () => repository().forwardMessage(messageId, c.id, clientId),
                () => router.replace({ pathname: '/chat/[id]', params: { id: c.id } }),
              )
            }
          />
        ))
      )}
    </Page>
  );
}
const attachmentIcons = {
  image: 'image',
  file: 'file',
  voice: 'mic',
  location: 'map-pin',
  contact: 'user',
} as const;
const chatStyles = StyleSheet.create({
  unread: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    minWidth: theme.spacing.xl,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  bubble: {
    maxWidth: '88%',
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xs,
  },
  mediaBubble: { width: '88%' },
  incoming: { alignSelf: 'flex-start', backgroundColor: theme.colors.surfaceSoft },
  outgoing: { alignSelf: 'flex-end', backgroundColor: theme.colors.messageOutgoing },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xs },
  media: {
    minHeight: theme.controls.textareaHeight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radii.md,
  },
});
