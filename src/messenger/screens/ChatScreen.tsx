import { formatTime, formatDate } from '@/i18n/format';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { ActionSheet } from '@/components/ActionSheet';
import { Button, IconButton, Page, StateView, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { MessageField } from '@/features/chats/MessageField';
import { VoiceRecorder } from '@/features/chats/VoiceRecorder';
import { AudioPlayback } from '@/features/chats/AudioPlayback';
import {
  imageSelection,
  fileSelection,
  discardCachedMedia,
  type SelectedMedia,
} from '@/features/chats/media-files';
import { useDevice } from '../DeviceProvider';
import type { LocalMessage } from '../model';
import { useLocalAction } from './shared';
import { RichMessageCard } from '../components/RichMessageCard';
import { RichCardComposer } from '../components/RichCardComposer';
import { readRichMedia, richMedia, voteEmoji, type RichCard } from '../rich-message';
import { useAttachmentPanel } from '../useAttachmentPanel';
import { useSentMessageScroll } from '../useSentMessageScroll';
import { useVisibleRead } from '../useVisibleRead';
import { CallBackSheet, CallMessage } from '../components/CallMessage';
import { MessageTimeReveal } from '../components/MessageMetadata';
import { MessageBubble } from '../components/MessageBubble';
import { PeerAvatar } from '../components/ContactCard';
import { ChatPhoto } from '../components/ChatPhoto';
import { AttachmentAction } from '../components/AttachmentAction';
import { LocationMessage } from '../components/LocationMessage';
import { ReplyQuote } from '../components/ReplyQuote';
import { MessageActions, type MessageAnchor } from '../components/MessageActions';

function MessageMedia({ message, onSelect }: { message: LocalMessage; onSelect: () => void }) {
  const { engine } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const q = useQuery({
    queryKey: ['device', 'media', message.attachment],
    queryFn: () => engine.media(message.attachment!),
    enabled: Boolean(message.attachment),
    networkMode: 'always',
  });
  const [cached, setCached] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (cached) discardCachedMedia(cached);
    },
    [cached],
  );
  async function resolve() {
    if (!q.data) throw new Error('MEDIA_MISSING');
    if (cached && new File(cached).exists) return cached;
    const file = new File(
      Paths.cache,
      `mnelo-media-${message.id}${message.kind === 'voice' ? '.m4a' : q.data.mime === 'image/jpeg' ? '.jpg' : q.data.mime === 'image/png' ? '.png' : '.bin'}`,
    );
    const binary = atob(q.data.bytes);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    file.write(bytes);
    setCached(file.uri);
    return file.uri;
  }
  if (!q.data)
    return (
      <StateView
        loading={q.isPending}
        error={q.isError ? t('messenger.genericError') : undefined}
      />
    );
  if (message.kind === 'image' && ['image/jpeg', 'image/png'].includes(q.data.mime))
    return (
      <ChatPhoto
        source={{
          id: message.id,
          chatId: message.chatId,
          sequence: message.sequence,
          sentAt: message.sentAt,
          attachment: message.attachment!,
        }}
        onLongPress={onSelect}
        name={q.data.name}
        uri={`data:${q.data.mime};base64,${q.data.bytes}`}
        busy={action.busy}
        error={action.error ?? null}
        share={() =>
          void action.run(async () => {
            await Sharing.shareAsync(await resolve(), {
              mimeType: q.data!.mime,
              UTI: q.data!.mime === 'image/png' ? 'public.png' : 'public.jpeg',
            });
          })
        }
      />
    );
  if (message.kind === 'voice')
    return <AudioPlayback uri="" resolveUri={resolve} durationSeconds={q.data.duration ?? 0} />;
  return (
    <View>
      <AppText>{q.data.name}</AppText>
      <Button
        variant="secondary"
        label={t('messenger.openFile')}
        busy={action.busy}
        onPress={() =>
          void action.run(async () => {
            await Sharing.shareAsync(await resolve(), { mimeType: q.data!.mime });
          })
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
function Bubble({
  message,
  onSelect,
  onReply,
}: {
  message: LocalMessage;
  onSelect: (anchor?: MessageAnchor) => void;
  onReply: () => void;
}) {
  const { identity, engine } = useDevice();
  const { t } = useTranslation();
  const reaction = useQuery({
    queryKey: ['device', 'reactions', message.id],
    queryFn: () => engine.reactions(message.id),
    networkMode: 'always',
  });
  const attachment = useQuery({
    queryKey: ['device', 'media', message.attachment],
    queryFn: () => engine.media(message.attachment!),
    enabled: message.kind === 'file' && Boolean(message.attachment),
    networkMode: 'always',
  });
  const card = message.kind === 'file' ? readRichMedia(attachment.data) : null;
  const own = message.sender === identity?.key;
  const bubbleRef = useRef<View>(null);
  function select() {
    const bubble = bubbleRef.current;
    if (!bubble) {
      onSelect();
      return;
    }
    bubble.measureInWindow((x, y, width, height) => onSelect({ x, y, width, height }));
  }
  return (
    <MessageTimeReveal onReply={onReply}>
      <MessageBubble
        own={own}
        bubbleRef={bubbleRef}
        onLongPress={select}
        accessibilityLabel={
          (message.body || t('common.more')) +
          '. ' +
          formatTime(new Date(message.sentAt).toISOString()) +
          (own ? '. ' + t(`messenger.${message.status}`) : '')
        }
        sentAt={message.sentAt}
        status={message.status}
        media={Boolean(message.attachment)}
        reactions={(reaction.data ?? []).filter(
          (reaction) =>
            card?.type !== 'poll' ||
            !voteEmoji.slice(0, card.options.length).some((emoji) => emoji === reaction.emoji),
        )}
      >
        {(message.body.length > 0 && !card) || message.replyTo ? (
          <View style={styles.messageBody}>
            {message.replyTo && <ReplyQuote chat={message.chatId} id={message.replyTo} />}
            {message.body.length > 0 && !card && <AppText>{message.body}</AppText>}
          </View>
        ) : null}
        {card ? (
          <RichMessageCard id={message.id} card={card} />
        ) : message.attachment ? (
          <MessageMedia message={message} onSelect={select} />
        ) : null}
        {message.kind === 'location' && /^[-\d.]+,[-\d.]+$/.test(message.body) && (
          <LocationMessage coordinates={message.body} />
        )}
      </MessageBubble>
    </MessageTimeReveal>
  );
}
export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, identity, mesh, calls, deliveryState, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [forward, setForward] = useState<LocalMessage | null>(null);
  const [contactPicker, setContactPicker] = useState(false);
  const contacts = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const chats = useQuery({
    queryKey: ['device', 'chats'],
    queryFn: () => view.chats(),
    networkMode: 'always',
  });
  const [text, setText] = useState('');
  const [selectedAnchor, setSelectedAnchor] = useState<MessageAnchor | undefined>();
  const [selected, setSelected] = useState<LocalMessage | null>(null);
  const [callBack, setCallBack] = useState<LocalMessage | null>(null);
  const [reply, setReply] = useState<string | undefined>();
  const attachmentPanel = useAttachmentPanel();
  const [cardComposer, setCardComposer] = useState<'poll' | 'event' | null>(null);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState<SelectedMedia | null>(null);
  const chat = useQuery({
    queryKey: ['device', 'chat', id],
    queryFn: () => view.chat(id),
    networkMode: 'always',
  });
  const members = useQuery({
    queryKey: ['device', 'members', id],
    queryFn: () => view.members(id),
    networkMode: 'always',
  });
  const messages = useInfiniteQuery({
    queryKey: ['device', 'messages', id],
    queryFn: ({ pageParam }) => engine.messages(id, pageParam),
    initialPageParam: Number.MAX_SAFE_INTEGER,
    getNextPageParam: (page) => (page.length === 40 ? page.at(-1)?.sequence : undefined),
    networkMode: 'always',
  });
  const rows = messages.data?.pages.flat() ?? [];
  const { listRef, sent: didSend } = useSentMessageScroll(id, rows);
  async function sendCurrent(body: string, options?: Parameters<typeof engine.send>[2]) {
    const messageId = await engine.send(id, body, options);
    didSend(messageId);
    return messageId;
  }
  const newest = rows[0]?.sequence;
  useVisibleRead(engine, id, newest);
  const remote = members.data?.find((member) => member.key !== identity?.key);
  useEffect(() => {
    if (remote?.key) void mesh?.focus(remote.key).catch(() => undefined);
  }, [mesh, remote?.key]);
  async function sendFile(file: SelectedMedia | null, kind: 'image' | 'file' | 'voice') {
    if (!file) return;
    let committed = false;
    try {
      const source = new File(file.uri);
      if (source.size > 10 * 1024 * 1024) throw new Error('MEDIA_SIZE_LIMIT');
      const bytes = await source.base64();
      await sendCurrent('', {
        kind,
        ...(reply ? { replyTo: reply } : {}),
        media: { name: file.name, mime: file.mime, bytes, duration: file.duration ?? null },
      });
      committed = true;
      attachmentPanel.close();
      setRecording(false);
      setVoice(null);
      setReply(undefined);
    } finally {
      // A voice preview must remain playable/retryable if the local commit fails.
      if (committed || kind !== 'voice') discardCachedMedia(file.uri);
    }
  }
  async function sendCard(card: RichCard) {
    const body =
      card.type === 'poll'
        ? '📊 ' +
          card.question +
          '\n' +
          card.options.map((option, index) => voteEmoji[index] + ' ' + option).join('\n')
        : '📅 ' +
          card.title +
          '\n' +
          formatDate(new Date(card.start).toISOString()) +
          ' · ' +
          formatTime(new Date(card.start).toISOString()) +
          (card.location ? '\n' + card.location : '');
    await sendCurrent(body, {
      kind: 'file',
      media: richMedia(card),
      ...(reply ? { replyTo: reply } : {}),
    });
  }
  return (
    <Page
      title={chat.data?.title ?? t('tabs.chats')}
      avatarName={chat.data?.title}
      avatar={
        chat.data?.kind === 'direct' && remote ? (
          <PeerAvatar peer={remote.key} name={chat.data.title} size="small" />
        ) : undefined
      }
      titleActionLabel={t(chat.data?.kind === 'group' ? 'messenger.groupDetails' : 'card.info')}
      onTitlePress={
        chat.data?.kind === 'group'
          ? () => router.push({ pathname: '/group/[id]', params: { id } })
          : remote
            ? () => router.push({ pathname: '/contact/[key]', params: { key: remote.key } })
            : undefined
      }
      titleLines={1}
      headerStyle={styles.chatHeader}
      back
      scroll={false}
      contentStyle={[ui.flex, styles.chatContent]}
      right={
        <View style={styles.headerButtons}>
          {chat.data?.kind === 'direct' && remote && (
            <>
              <IconButton
                icon="phone"
                label={t('messenger.callVoice')}
                disabled={!calls || (!calls.supportsQueuedSignaling && !mesh?.online(remote.key))}
                onPress={() =>
                  router.push({ pathname: '/call/[id]', params: { id, media: 'voice' } })
                }
              />
              <IconButton
                icon="video"
                label={t('messenger.callVideo')}
                disabled={!calls || (!calls.supportsQueuedSignaling && !mesh?.online(remote.key))}
                onPress={() =>
                  router.push({ pathname: '/call/[id]', params: { id, media: 'video' } })
                }
              />
            </>
          )}
        </View>
      }
    >
      {!deliveryState && (
        <AppText variant="caption" tone="secondary">
          {t(remote && mesh?.online(remote.key) ? 'messenger.peerOnline' : 'messenger.peerOffline')}
        </AppText>
      )}
      {deliveryState === 'message-error' && (
        <AppText variant="caption">{t('messenger.deliverySomeFailed')}</AppText>
      )}
      {deliveryState === 'offline' && (
        <AppText variant="caption" tone="secondary">
          {t('messenger.deliveryOffline')}
        </AppText>
      )}
      {deliveryState === 'update-required' && (
        <AppText variant="caption" tone="secondary">
          {t('messenger.deliveryUpdate')}
        </AppText>
      )}
      {deliveryState === 'peer-not-ready' && (
        <AppText variant="caption" tone="secondary">
          {t('messenger.deliveryPeerNotReady')}
        </AppText>
      )}
      {deliveryState === 'identity-changed' && (
        <AppText variant="caption" tone="secondary">
          {t('messenger.deliveryIdentity')}
        </AppText>
      )}
      <FlatList
        ref={listRef}
        data={rows}
        inverted
        keyExtractor={(row) => row.id}
        initialNumToRender={8}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) =>
          item.kind === 'call' ? (
            <CallMessage
              message={item}
              onLongPress={() => {
                Keyboard.dismiss();
                setSelectedAnchor(undefined);
                setSelected(item);
              }}
              onPress={() => {
                Keyboard.dismiss();
                setCallBack(item);
              }}
            />
          ) : (
            <Bubble
              message={item}
              onSelect={(anchor) => {
                Keyboard.dismiss();
                setSelectedAnchor(anchor);
                setSelected(item);
              }}
              onReply={() => setReply(item.id)}
            />
          )
        }
        onEndReached={() => {
          if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <StateView loading={messages.isPending} message={t('messenger.noChats')} />
          </View>
        }
      />
      {callBack && (
        <CallBackSheet
          message={callBack}
          name={chat.data?.title ?? t('brand')}
          available={Boolean(
            chat.data?.kind === 'direct' &&
            remote &&
            calls &&
            (calls.supportsQueuedSignaling || mesh?.online(remote.key)),
          )}
          onClose={() => setCallBack(null)}
          onCall={(media) => router.push({ pathname: '/call/[id]', params: { id, media } })}
        />
      )}
      {reply && (
        <View style={ui.row}>
          <View style={ui.flex}>
            <ReplyQuote chat={id} id={reply} />
          </View>
          <IconButton icon="x" label={t('common.cancel')} onPress={() => setReply(undefined)} />
        </View>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      {recording ? (
        <View style={ui.stack}>
          <VoiceRecorder
            autoStart
            onReady={setVoice}
            disabled={action.busy}
            onSend={() => void action.run(() => sendFile(voice, 'voice'))}
            onCancel={() => {
              setRecording(false);
              setVoice(null);
            }}
          />
        </View>
      ) : (
        <View style={ui.row}>
          <IconButton
            icon={attachmentPanel.visible ? 'x' : 'plus'}
            label={t('messenger.attachments')}
            onPress={attachmentPanel.toggle}
          />
          <View style={ui.flex}>
            <MessageField
              value={text}
              onChangeText={setText}
              focusKey={reply}
              onFocus={attachmentPanel.close}
            />
          </View>
          {text.trim() ? (
            <IconButton
              icon="send"
              variant="accent"
              label={t('common.send')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  await sendCurrent(text, reply ? { replyTo: reply } : {});
                  setText((draft) => (draft === text ? '' : draft));
                  setReply(undefined);
                })
              }
            />
          ) : (
            <IconButton
              icon="mic"
              label={t('messenger.voice')}
              onPress={() => {
                Keyboard.dismiss();
                attachmentPanel.close();
                setVoice(null);
                setRecording(true);
              }}
            />
          )}
        </View>
      )}
      <ActionSheet
        visible={Boolean(forward)}
        title={t('messenger.forward')}
        onClose={() => setForward(null)}
      >
        {chats.data
          ?.filter((chat) => !chat.left_group)
          .map((chat) => (
            <Button
              key={chat.id}
              variant="secondary"
              label={chat.title}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  if (!forward || forward.kind === 'call') return;
                  const media = forward.attachment ? await engine.media(forward.attachment) : null;
                  await engine.send(chat.id, forward.body, {
                    kind: forward.kind as
                      'text' | 'file' | 'image' | 'voice' | 'location' | 'contact',
                    ...(media ? { media } : {}),
                  });
                  setForward(null);
                })
              }
            />
          ))}
      </ActionSheet>
      <ActionSheet
        visible={contactPicker}
        title={t('messenger.contact')}
        onClose={() => setContactPicker(false)}
      >
        {contacts.data
          ?.filter((contact) => !contact.blocked)
          .map((contact) => (
            <Button
              key={contact.key}
              variant="secondary"
              label={contact.name}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  await sendCurrent(contact.name + '\nmnelo1:' + contact.key, {
                    kind: 'contact',
                  });
                  setContactPicker(false);
                })
              }
            />
          ))}
      </ActionSheet>
      {selected && (
        <MessageActions
          message={selected}
          own={selected.sender === identity?.key}
          anchor={selectedAnchor}
          busy={action.busy}
          close={() => setSelected(null)}
          reply={() => {
            setReply(selected.id);
            setSelected(null);
          }}
          forward={() => {
            setForward(selected);
            setSelected(null);
          }}
          copy={() =>
            void action.run(async () => {
              await Clipboard.setStringAsync(selected.body);
              setSelected(null);
            })
          }
          react={(emoji) =>
            void action.run(async () => {
              await engine.react(selected.id, emoji);
              setSelected(null);
            })
          }
          retry={() =>
            void action.run(async () => {
              await engine.retryMessage(selected.id);
              setSelected(null);
            })
          }
          remove={() =>
            void action.run(async () => {
              await engine.deleteLocalMessage(selected.id);
              setSelected(null);
            })
          }
        />
      )}
      {attachmentPanel.visible && (
        <ScrollView
          testID="attachment-panel"
          style={[styles.attachmentPanel, { height: attachmentPanel.height }]}
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.attachmentGrid}>
            <AttachmentAction
              icon="image"
              label={t('messenger.photo')}
              busy={action.busy}
              onPress={() => void action.run(async () => sendFile(await imageSelection(), 'image'))}
            />
            <AttachmentAction
              icon="camera"
              label={t('messenger.camera')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => sendFile(await imageSelection(true), 'image'))
              }
            />
            <AttachmentAction
              icon="map-pin"
              label={t('messenger.attachmentLocation')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const permission = await Location.requestForegroundPermissionsAsync();
                  if (!permission.granted) throw new Error('LOCATION_PERMISSION_REQUIRED');
                  const point = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                  });
                  await sendCurrent(`${point.coords.latitude},${point.coords.longitude}`, {
                    kind: 'location',
                  });
                  attachmentPanel.close();
                })
              }
            />
            <AttachmentAction
              icon="user"
              label={t('messenger.attachmentContact')}
              onPress={() => {
                attachmentPanel.close();
                setContactPicker(true);
              }}
            />
            <AttachmentAction
              icon="file-text"
              label={t('messenger.file')}
              busy={action.busy}
              onPress={() => void action.run(async () => sendFile(await fileSelection(), 'file'))}
            />
            <AttachmentAction
              icon="bar-chart-2"
              label={t('messenger.poll')}
              onPress={() => {
                attachmentPanel.close();
                setCardComposer('poll');
              }}
            />
            <AttachmentAction
              icon="calendar"
              label={t('messenger.event')}
              onPress={() => {
                attachmentPanel.close();
                setCardComposer('event');
              }}
            />
          </View>
        </ScrollView>
      )}
      {cardComposer && (
        <RichCardComposer
          kind={cardComposer}
          close={() => setCardComposer(null)}
          busy={action.busy}
          error={action.error}
          send={(card) =>
            void action.run(async () => {
              await sendCard(card);
              setCardComposer(null);
              setReply(undefined);
            })
          }
        />
      )}
    </Page>
  );
}
const styles = StyleSheet.create({
  chatHeader: {
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  chatContent: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm },
  headerButtons: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
  },
  attachmentPanel: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#DCDDD9',
    marginHorizontal: -theme.spacing.md,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
  },
  panelContent: { paddingVertical: theme.spacing.md },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  messageBody: { minHeight: theme.spacing.xl },
  empty: { transform: [{ scaleY: -1 }] },
});
