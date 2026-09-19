import { formatTime, formatDate } from '@/i18n/format';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  StyleSheet,
  View,
  type TextInput,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { ActionSheet } from '@/components/ActionSheet';
import { Avatar, Button, IconButton, Page, StateView, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MessageField } from '@/features/chats/MessageField';
import { VoiceRecorder } from '@/features/chats/VoiceRecorder';
import { AudioPlayback } from '@/features/chats/AudioPlayback';
import {
  imageSelections,
  fileSelection,
  discardCachedMedia,
  type SelectedMedia,
} from '@/features/chats/media-files';
import { useDevice } from '../DeviceProvider';
import type { LocalMessage } from '../model';
import { useLocalAction } from './shared';
import { sendSelectedMedia } from '../send-media';
import { RichMessageCard } from '../components/RichMessageCard';
import { RichCardComposer } from '../components/RichCardComposer';
import { readRichMedia, richMedia, voteEmoji, type RichCard } from '../rich-message';
import { useAttachmentPanel } from '../useAttachmentPanel';
import { useQuotedMessageScroll } from '../useQuotedMessageScroll';
import { useSentMessageScroll } from '../useSentMessageScroll';
import { useVisibleRead } from '../useVisibleRead';
import { CallBackSheet, CallMessage } from '../components/CallMessage';
import { MessageTimeReveal } from '../components/MessageMetadata';
import { MessageBubble } from '../components/MessageBubble';
import { PeerAvatar } from '../components/ContactCard';
import { readGroupProfile } from '../group-profile';
import { avatarUri } from '../profile-avatar';
import { ChatPhoto } from '../components/ChatPhoto';
import { ChatVideo } from '../components/ChatVideo';
import { mediaPreviewSize, visualMediaKind, type MediaDimensions } from '../media-preview';
import { AttachmentAction } from '../components/AttachmentAction';
import { LocationMessage } from '../components/LocationMessage';
import { LocationComposer } from '../components/LocationComposer';
import { choosePlace, coordinateBody, nativePlacePickerAvailable } from '../location-picker';
import { ReplyQuote } from '../components/ReplyQuote';
import { createMenuGesture, menuTouchPoint, type MenuTouch, type MenuPoint } from '../menu-gesture';
import { MessageActions, type MessageAnchor } from '../components/MessageActions';
import { PhotoAlbum } from '../components/PhotoAlbum';
import { photoAlbums, timelineContains } from '../photo-albums';
import { forwardSharedContact, presentSharedContact } from '../contact-share';
import { ContactShareChoices } from '../components/ContactShareChoices';

function MessageMedia({
  message,
  onSelect,
  size,
  onDimensions,
}: {
  message: LocalMessage;
  onSelect: () => void;
  size: MediaDimensions;
  onDimensions: (size: MediaDimensions) => void;
}) {
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
  if (visualMediaKind(q.data.mime) === 'video')
    return (
      <ChatVideo media={q.data} size={size} onDimensions={onDimensions} onLongPress={onSelect} />
    );
  if (visualMediaKind(q.data.mime) === 'photo')
    return (
      <ChatPhoto
        size={size}
        onDimensions={onDimensions}
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
export function ChatMessageBubble({
  message,
  onSelect,
  onReply,
  onInfo,
  onQuote,
  highlighted = false,
  menuOpen,
}: {
  message: LocalMessage;
  onSelect: (anchor?: MessageAnchor) => void;
  onReply: () => void;
  onInfo?: (() => void) | undefined;
  onQuote?: (id: string) => void;
  highlighted?: boolean;
  menuOpen: boolean;
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
    enabled: Boolean(message.attachment),
    networkMode: 'always',
  });
  const { width: windowWidth } = useWindowDimensions();
  const [dimensions, setDimensions] = useState<MediaDimensions>({ width: 1, height: 1 });
  const visual = Boolean(visualMediaKind(attachment.data?.mime));
  const size = mediaPreviewSize(dimensions, (windowWidth - 32) * 0.86);
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
    <MessageTimeReveal
      onReply={menuOpen ? undefined : onReply}
      onInfo={menuOpen ? undefined : onInfo}
    >
      <MessageBubble
        own={own}
        highlighted={highlighted}
        interactiveChildren={Boolean(message.replyTo && onQuote)}
        bubbleRef={bubbleRef}
        onLongPress={select}
        accessibilityLabel={
          (message.body || t(message.kind === 'contact' ? 'messenger.contact' : 'common.more')) +
          '. ' +
          formatTime(new Date(message.sentAt).toISOString()) +
          (own ? '. ' + t(`messenger.${message.status}`) : '')
        }
        sentAt={message.sentAt}
        status={message.status}
        media={Boolean(message.attachment)}
        visual={visual}
        overlayMetadata={visual && !message.body && !message.editedAt}
        containerStyle={visual ? { width: size.width } : undefined}
        reactions={(reaction.data ?? []).filter(
          (reaction) =>
            card?.type !== 'poll' ||
            !voteEmoji.slice(0, card.options.length).some((emoji) => emoji === reaction.emoji),
        )}
      >
        {message.kind === 'deleted' && (
          <AppText tone="secondary">{t('messenger.deletedMessage')}</AppText>
        )}
        {visual && message.replyTo && (
          <View style={styles.visualText}>
            <ReplyQuote
              chat={message.chatId}
              id={message.replyTo}
              onPress={onQuote ? () => onQuote(message.replyTo!) : undefined}
            />
          </View>
        )}
        {!visual &&
        (((message.body.length > 0 || message.kind === 'contact') && !card) || message.replyTo) ? (
          <View style={styles.messageBody}>
            {message.replyTo && (
              <ReplyQuote
                chat={message.chatId}
                id={message.replyTo}
                onPress={onQuote ? () => onQuote(message.replyTo!) : undefined}
              />
            )}
            {!card && (
              <AppText>
                {message.body || (message.kind === 'contact' ? t('messenger.contact') : '')}
              </AppText>
            )}
          </View>
        ) : null}
        {card ? (
          <RichMessageCard id={message.id} card={card} />
        ) : message.attachment ? (
          <MessageMedia
            message={message}
            onSelect={select}
            size={size}
            onDimensions={setDimensions}
          />
        ) : null}
        {visual && Boolean(message.body) && (
          <View style={styles.visualText}>
            <AppText>{message.body}</AppText>
          </View>
        )}
        {Boolean(message.editedAt) && (
          <AppText variant="caption" tone="secondary" style={visual && styles.visualText}>
            {t('messenger.edited')}
          </AppText>
        )}
        {message.kind === 'location' && /^[-\d.]+,[-\d.]+$/.test(message.body) && (
          <LocationMessage coordinates={message.body} />
        )}
      </MessageBubble>
    </MessageTimeReveal>
  );
}
export function ChatScreen() {
  const reduceMotion = useReducedMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { engine, identity, mesh, calls, deliveryState, view } = useDevice();
  // Permission sheets/native map searches may outlive their originating chat.
  // Never commit their result after navigation, account change or unmount.
  const locationOrigin = useRef<object | null>(null);
  useFocusEffect(
    useCallback(() => {
      const origin = { engine, chat: id };
      locationOrigin.current = origin;
      return () => {
        if (locationOrigin.current === origin) locationOrigin.current = null;
      };
    }, [engine, id]),
  );
  function showMessageInfo(message: LocalMessage) {
    Keyboard.dismiss();
    router.push({ pathname: '/message-info/[id]', params: { id: message.id, chat: id } });
  }
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
  const [editing, setEditing] = useState<{
    message: LocalMessage;
    draft: string;
    reply: string | undefined;
  } | null>(null);
  const [selectedAnchor, setSelectedAnchor] = useState<MessageAnchor | undefined>();
  const [menuGesture] = useState(createMenuGesture);
  const touchHeld = useRef(false);
  const menuHeld = useRef(false);
  const menuMoved = useRef(false);
  const lastMenuPoint = useRef<MenuPoint>({ x: -1, y: -1 });
  const [selected, setSelected] = useState<LocalMessage | null>(null);
  const [callBack, setCallBack] = useState<LocalMessage | null>(null);
  const [reply, setReply] = useState<string | undefined>();
  const insets = useSafeAreaInsets();
  const messageInput = useRef<TextInput>(null);
  const attachmentPanel = useAttachmentPanel(insets.bottom);
  const quickEmoji = useQuery({
    queryKey: ['device', 'recent-reactions'],
    queryFn: () => engine.quickReactionChoices(),
    networkMode: 'always',
  });
  const [cardComposer, setCardComposer] = useState<'poll' | 'event' | null>(null);
  const [locationComposer, setLocationComposer] = useState(false);
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
  const rows = (messages.data?.pages.flat() ?? []).map((message) =>
    presentSharedContact(message, contacts.data ?? []),
  );
  const timeline = photoAlbums(rows);
  const { listRef, sent: didSend } = useSentMessageScroll(id, rows);
  const quoteScroll = useQuotedMessageScroll(
    id,
    listRef,
    timeline,
    async (message) => Boolean(await engine.replyPreview(id, message)),
    () => messages.fetchNextPage({ cancelRefetch: false }),
    reduceMotion,
  );
  async function sendCurrent(body: string, options?: Parameters<typeof engine.send>[2]) {
    quoteScroll.cancel();
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
  async function sendFiles(files: SelectedMedia[], kind: 'image' | 'file' | 'voice') {
    if (!files.length) return;
    const committed: string[] = [];
    try {
      await sendSelectedMedia(
        files,
        kind,
        async (body, options) => {
          const messageId = await sendCurrent(body, options);
          committed.push(messageId);
          return messageId;
        },
        reply,
      );
      attachmentPanel.close();
      setRecording(false);
      setVoice(null);
      setReply(undefined);
    } finally {
      // Batch items enter the durable outbox in selection order before networking.
      if (committed.length && files.length > 1)
        void (async () => {
          for (const messageId of committed) await engine.flush(undefined, messageId);
        })().catch(() => undefined);
    }
  }
  async function sendFile(file: SelectedMedia | null, kind: 'image' | 'file' | 'voice') {
    if (file) await sendFiles([file], kind);
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
  const menuTouch = (
    phase: MenuTouch['phase'],
    event: import('react-native').GestureResponderEvent,
  ) => {
    const point = menuTouchPoint(event.nativeEvent, lastMenuPoint.current);
    lastMenuPoint.current = point;
    if (phase === 'move') menuMoved.current = true;
    if (menuHeld.current && menuMoved.current)
      menuGesture.update({
        phase,
        point,
      });
    if (phase !== 'move') {
      touchHeld.current = false;
      menuHeld.current = false;
    }
  };
  return (
    <View
      style={ui.flex}
      onStartShouldSetResponderCapture={() => {
        touchHeld.current = true;
        return false;
      }}
      onTouchEnd={(event) => menuTouch('release', event)}
      onTouchCancel={(event) => menuTouch('cancel', event)}
      onMoveShouldSetResponderCapture={() => menuHeld.current}
      onResponderGrant={(event) => menuTouch('move', event)}
      onResponderMove={(event) => menuTouch('move', event)}
      onResponderRelease={(event) => menuTouch('release', event)}
      onResponderTerminate={(event) => menuTouch('cancel', event)}
      onResponderTerminationRequest={() => !menuHeld.current}
    >
      <View
        style={ui.flex}
        aria-hidden={Boolean(selected)}
        accessibilityElementsHidden={Boolean(selected)}
        importantForAccessibility={selected ? 'no-hide-descendants' : 'auto'}
      >
        <Page
          title={chat.data?.title ?? t('tabs.chats')}
          avatarName={chat.data?.title}
          avatar={
            chat.data?.kind === 'direct' && remote ? (
              <PeerAvatar peer={remote.key} name={chat.data.title} size="small" />
            ) : chat.data?.kind === 'group' ? (
              <Avatar
                name={chat.data.title}
                uri={avatarUri(readGroupProfile(chat.data).avatar)}
                size="small"
              />
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
          bottomSafe={false}
          avoidKeyboard={!attachmentPanel.managedKeyboard}
          back
          scroll={false}
          contentStyle={[ui.flex, styles.chatContent]}
          right={
            <View style={styles.headerButtons}>
              {chat.data && !chat.data.left_group && remote && (
                <>
                  <IconButton
                    icon="phone"
                    label={t('messenger.callVoice')}
                    disabled={
                      !calls || (!calls.supportsQueuedSignaling && !mesh?.online(remote.key))
                    }
                    onPress={() =>
                      router.push({ pathname: '/call/[id]', params: { id, media: 'voice' } })
                    }
                  />
                  <IconButton
                    icon="video"
                    label={t('messenger.callVideo')}
                    disabled={
                      !calls || (!calls.supportsQueuedSignaling && !mesh?.online(remote.key))
                    }
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
              {t(
                remote && mesh?.online(remote.key)
                  ? 'messenger.peerOnline'
                  : 'messenger.peerOffline',
              )}
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
            onScrollBeginDrag={quoteScroll.cancel}
            onScrollToIndexFailed={quoteScroll.onScrollToIndexFailed}
            onViewableItemsChanged={quoteScroll.onViewableItemsChanged}
            data={timeline}
            scrollEnabled={!selected}
            inverted
            keyExtractor={(row) => row.id}
            removeClippedSubviews={false}
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
                    menuMoved.current = false;
                    menuHeld.current = touchHeld.current;
                    setSelected(item);
                  }}
                  onPress={() => {
                    Keyboard.dismiss();
                    setCallBack(item);
                  }}
                />
              ) : item.photos ? (
                <PhotoAlbum
                  photos={item.photos}
                  onInfo={item.sender === identity?.key ? showMessageInfo : undefined}
                  highlighted={timelineContains(item, quoteScroll.highlighted)}
                  menuOpen={Boolean(selected)}
                  onSelect={(message, anchor) => {
                    Keyboard.dismiss();
                    setSelectedAnchor(anchor);
                    menuMoved.current = false;
                    menuHeld.current = touchHeld.current;
                    setSelected(message);
                  }}
                  onReply={(message) => {
                    if (editing) {
                      setText(editing.draft);
                      setEditing(null);
                    }
                    setReply(message.id);
                  }}
                />
              ) : (
                <ChatMessageBubble
                  message={item}
                  onInfo={item.sender === identity?.key ? () => showMessageInfo(item) : undefined}
                  highlighted={quoteScroll.highlighted === item.id}
                  onQuote={(id) => {
                    Keyboard.dismiss();
                    void quoteScroll.jump(id);
                  }}
                  menuOpen={Boolean(selected)}
                  onSelect={(anchor) => {
                    Keyboard.dismiss();
                    setSelectedAnchor(anchor);
                    menuMoved.current = false;
                    menuHeld.current = touchHeld.current;
                    setSelected(item);
                  }}
                  onReply={() => {
                    if (editing) {
                      setText(editing.draft);
                      setEditing(null);
                    }
                    setReply(item.id);
                  }}
                />
              )
            }
            onEndReached={() => {
              if (messages.hasNextPage && !messages.isFetchingNextPage)
                void messages.fetchNextPage();
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <StateView loading={messages.isPending} message={t('messenger.noChats')} />
              </View>
            }
          />
          {quoteScroll.unavailable && (
            <View style={ui.row}>
              <AppText variant="caption" tone="secondary" style={ui.flex}>
                {t('messenger.quoteUnavailable')}
              </AppText>
              <IconButton icon="x" label={t('common.cancel')} onPress={quoteScroll.cancel} />
            </View>
          )}
          {callBack && (
            <CallBackSheet
              message={callBack}
              name={chat.data?.title ?? t('brand')}
              available={Boolean(
                chat.data &&
                !chat.data.left_group &&
                remote &&
                calls &&
                (calls.supportsQueuedSignaling || mesh?.online(remote.key)),
              )}
              onClose={() => setCallBack(null)}
              onCall={(media) => router.push({ pathname: '/call/[id]', params: { id, media } })}
            />
          )}
          {editing && (
            <View style={styles.editingBanner}>
              <View style={ui.flex}>
                <AppText variant="caption" tone="secondary">
                  {t('messenger.editMessage')}
                </AppText>
                <AppText variant="caption" numberOfLines={1}>
                  {editing.message.body}
                </AppText>
              </View>
              <IconButton
                icon="x"
                label={t('common.cancel')}
                disabled={action.busy}
                onPress={() => {
                  setText(editing.draft);
                  setReply(editing.reply);
                  setEditing(null);
                }}
              />
            </View>
          )}
          {!editing && reply && (
            <View style={ui.row}>
              <View style={ui.flex}>
                <ReplyQuote
                  chat={id}
                  id={reply}
                  onPress={() => {
                    Keyboard.dismiss();
                    void quoteScroll.jump(reply);
                  }}
                />
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
            <View style={styles.composer}>
              <IconButton
                disabled={Boolean(editing)}
                icon={attachmentPanel.visible ? 'keyboard' : 'plus'}
                label={t(
                  attachmentPanel.visible ? 'messenger.showKeyboard' : 'messenger.attachments',
                )}
                onPress={() => attachmentPanel.toggle(() => messageInput.current?.focus())}
              />
              <View style={ui.flex}>
                <MessageField
                  inputRef={messageInput}
                  editable={!editing || !action.busy}
                  value={text}
                  onChangeText={(value) => {
                    quoteScroll.cancel();
                    setText(value);
                  }}
                  focusKey={editing?.message.id ?? reply}
                  onFocus={attachmentPanel.focusInput}
                />
              </View>
              {text.trim() || editing ? (
                <IconButton
                  icon={editing ? 'check' : 'send'}
                  variant="accent"
                  label={t(editing ? 'common.save' : 'common.send')}
                  disabled={!text.trim() || Boolean(editing && text === editing.message.body)}
                  busy={action.busy}
                  onPress={() =>
                    void action.run(async () => {
                      if (editing) {
                        await engine.editMessage(editing.message.id, text);
                        setText(editing.draft);
                        setReply(editing.reply);
                        setEditing(null);
                        return;
                      }
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
                      const media = forward.attachment
                        ? await engine.media(forward.attachment)
                        : null;
                      await engine.send(
                        chat.id,
                        forward.kind === 'contact'
                          ? forwardSharedContact(
                              rows.find((message) => message.id === forward.id)?.body ??
                                forward.body,
                              contacts.data ?? [],
                            )
                          : forward.body,
                        {
                          kind: forward.kind as
                            'text' | 'file' | 'image' | 'voice' | 'location' | 'contact',
                          ...(media ? { media } : {}),
                        },
                      );
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
            <ContactShareChoices
              contacts={contacts.data ?? []}
              busy={action.busy}
              onShare={(body) =>
                void action.run(async () => {
                  await sendCurrent(body, { kind: 'contact' });
                  setContactPicker(false);
                })
              }
            />
          </ActionSheet>
          <View
            testID="chat-input-dock"
            style={{ height: attachmentPanel.reservedHeight, flexShrink: 0 }}
          >
            {attachmentPanel.visible && (
              <View
                testID="attachment-panel"
                style={[styles.attachmentPanel, { paddingBottom: insets.bottom }]}
              >
                <View style={styles.attachmentGrid}>
                  <AttachmentAction
                    icon="image"
                    color="#147BF3"
                    label={t('messenger.photo')}
                    busy={action.busy}
                    onPress={() =>
                      void action.run(async () => sendFiles(await imageSelections(), 'image'))
                    }
                  />
                  <AttachmentAction
                    icon="camera"
                    color="#46515D"
                    label={t('messenger.camera')}
                    busy={action.busy}
                    onPress={() =>
                      void action.run(async () => sendFiles(await imageSelections(true), 'image'))
                    }
                  />
                  <AttachmentAction
                    icon="map-pin"
                    color="#008B68"
                    label={t('messenger.attachmentLocation')}
                    busy={action.busy}
                    onPress={() => {
                      attachmentPanel.close();
                      if (!nativePlacePickerAvailable()) {
                        setLocationComposer(true);
                        return;
                      }
                      void action.run(async () => {
                        const origin = locationOrigin.current;
                        const point = await choosePlace({
                          title: t('messenger.attachmentLocation'),
                          cancel: t('common.cancel'),
                          send: t('common.send'),
                          search: t('messenger.locationSearch'),
                          map: t('messenger.locationMap'),
                          hint: t('messenger.locationHint'),
                          selected: t('messenger.locationSelected'),
                          searching: t('messenger.locationSearching'),
                          noResults: t('messenger.locationNoResults'),
                          choose: t('messenger.locationChoose'),
                        });
                        if (point && origin && origin === locationOrigin.current)
                          await sendCurrent(coordinateBody(point), { kind: 'location' });
                      });
                    }}
                  />
                  <AttachmentAction
                    icon="user"
                    color="#7460CE"
                    label={t('messenger.attachmentContact')}
                    onPress={() => {
                      attachmentPanel.close();
                      setContactPicker(true);
                    }}
                  />
                  <AttachmentAction
                    icon="file-text"
                    color="#008DB8"
                    label={t('messenger.file')}
                    busy={action.busy}
                    onPress={() =>
                      void action.run(async () => sendFile(await fileSelection(), 'file'))
                    }
                  />
                  <AttachmentAction
                    icon="bar-chart-2"
                    color="#C28100"
                    label={t('messenger.poll')}
                    onPress={() => {
                      attachmentPanel.close();
                      setCardComposer('poll');
                    }}
                  />
                  <AttachmentAction
                    icon="calendar"
                    color="#D92354"
                    label={t('messenger.event')}
                    onPress={() => {
                      attachmentPanel.close();
                      setCardComposer('event');
                    }}
                  />
                  <AttachmentAction
                    icon="navigation"
                    color="#008B68"
                    label={t('messenger.attachmentMyLocation')}
                    busy={action.busy}
                    onPress={() =>
                      void action.run(async () => {
                        const origin = locationOrigin.current;
                        const permission = await Location.requestForegroundPermissionsAsync();
                        if (!origin || origin !== locationOrigin.current) return;
                        if (!permission.granted) throw new Error('LOCATION_PERMISSION_REQUIRED');
                        const point = await Location.getCurrentPositionAsync({
                          accuracy: Location.Accuracy.Balanced,
                        });
                        if (origin !== locationOrigin.current) return;
                        await sendCurrent(coordinateBody(point.coords), { kind: 'location' });
                        attachmentPanel.close();
                      })
                    }
                  />
                </View>
              </View>
            )}
          </View>
          {locationComposer && (
            <LocationComposer
              close={() => setLocationComposer(false)}
              busy={action.busy}
              error={action.error}
              send={(body) =>
                void action.run(async () => {
                  await sendCurrent(body, { kind: 'location' });
                  setLocationComposer(false);
                })
              }
            />
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
      </View>
      {selected && (
        <MessageActions
          inline
          gesture={menuGesture}
          reduceMotion={reduceMotion}
          message={selected}
          own={selected.sender === identity?.key}
          showInfo={
            selected.sender === identity?.key && selected.kind !== 'call'
              ? () => showMessageInfo(selected)
              : undefined
          }
          anchor={selectedAnchor}
          busy={action.busy}
          close={() => {
            menuHeld.current = false;
            setSelected(null);
          }}
          quickEmojis={quickEmoji.data}
          edit={() => {
            setEditing({
              message: selected,
              draft: editing?.draft ?? text,
              reply: editing?.reply ?? reply,
            });
            setText(selected.body);
            setReply(undefined);
            attachmentPanel.close();
            setRecording(false);
          }}
          removeEverywhere={() =>
            void action.run(async () => {
              await engine.deleteForEveryone(selected.id);
              quoteScroll.cancel();
              if (reply === selected.id) setReply(undefined);
              setSelected(null);
            })
          }
          reply={() => {
            if (editing) {
              setText(editing.draft);
              setEditing(null);
            }
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
              quoteScroll.cancel();
              if (reply === selected.id) setReply(undefined);
              setSelected(null);
            })
          }
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  visualText: { paddingHorizontal: 12, paddingVertical: 8 },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
  },
  chatHeader: {
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  chatContent: { paddingHorizontal: theme.spacing.md, paddingBottom: 0, gap: theme.spacing.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
  },
  attachmentPanel: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#DCDDD9',
    marginHorizontal: -theme.spacing.md,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
  },
  attachmentGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 8,
    paddingBottom: 4,
  },
  messageBody: { minHeight: theme.spacing.xl },
  empty: { transform: [{ scaleY: -1 }] },
});
