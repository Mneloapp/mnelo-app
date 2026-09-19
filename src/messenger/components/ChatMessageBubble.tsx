import { SharedMapMessage } from './SharedMapMessage';
import { sharedMapLink } from '../map-link';
import { SharedContactMessage } from './SharedContactMessage';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AppText } from '@/components/AppText';
import { Button, StateView } from '@/components/ui';
import { formatTime } from '@/i18n/format';
import { theme } from '@/theme/tokens';
import { AudioPlayback } from '@/features/chats/AudioPlayback';
import { discardCachedMedia } from '@/features/chats/media-files';
import { useDevice } from '../DeviceProvider';
import { useLocalAction } from '../screens/shared';
import type { LocalMessage } from '../model';
import { mediaPreviewSize, visualMediaKind, type MediaDimensions } from '../media-preview';
import { readRichMedia, voteEmoji } from '../rich-message';
import { RichMessageCard } from './RichMessageCard';
import { MessageTimeReveal } from './MessageMetadata';
import { MessageBubble } from './MessageBubble';
import { ChatPhoto } from './ChatPhoto';
import { ChatVideo } from './ChatVideo';
import { LocationMessage } from './LocationMessage';
import { ReplyQuote } from './ReplyQuote';
import type { MessageAnchor } from './MessageActions';
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
      infoMessage={message}
    >
      <MessageBubble
        own={own}
        highlighted={highlighted}
        interactiveChildren={
          Boolean(message.replyTo && onQuote) ||
          message.kind === 'contact' ||
          message.kind === 'location' ||
          Boolean(sharedMapLink(message.body))
        }
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
            {!card &&
              (message.kind === 'contact' ? (
                <SharedContactMessage body={message.body} enabled={!menuOpen} />
              ) : (
                <AppText>
                  {message.body || (message.kind === 'contact' ? t('messenger.contact') : '')}
                </AppText>
              ))}
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
        {(message.kind === 'text' || message.kind === 'location') && !menuOpen && (
          <SharedMapMessage body={message.body} />
        )}
        {message.kind === 'location' && /^[-\d.]+,[-\d.]+$/.test(message.body) && (
          <LocationMessage coordinates={message.body} />
        )}
      </MessageBubble>
    </MessageTimeReveal>
  );
}
const styles = StyleSheet.create({
  visualText: { paddingHorizontal: 12, paddingVertical: 8 },
  messageBody: { minHeight: theme.spacing.xl },
});
