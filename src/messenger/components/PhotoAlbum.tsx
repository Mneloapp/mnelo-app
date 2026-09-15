import { useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { StateView } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import type { LocalMessage } from '../model';
import { albumStatus } from '../photo-albums';
import { MessageBubble } from './MessageBubble';
import { MessageTimeReveal } from './MessageMetadata';
import { ChatPhoto } from './ChatPhoto';
import type { MessageAnchor } from './MessageActions';

function AlbumPhoto({
  message,
  width,
  height,
  remaining,
  onSelect,
}: {
  message: LocalMessage;
  width: number;
  height: number;
  remaining: number;
  onSelect: (message: LocalMessage, anchor?: MessageAnchor) => void;
}) {
  const { engine } = useDevice();
  const { t } = useTranslation();
  const ref = useRef<View>(null);
  const media = useQuery({
    queryKey: ['device', 'media', message.attachment],
    queryFn: () => engine.media(message.attachment!),
    networkMode: 'always',
  });
  const reactions = useQuery({
    queryKey: ['device', 'reactions', message.id],
    queryFn: () => engine.reactions(message.id),
    networkMode: 'always',
  });
  return (
    <View ref={ref} collapsable={false} style={{ width, height }}>
      {media.data ? (
        <ChatPhoto
          uri={`data:${media.data.mime};base64,${media.data.bytes}`}
          name={media.data.name}
          source={{
            id: message.id,
            chatId: message.chatId,
            sequence: message.sequence,
            sentAt: message.sentAt,
            attachment: message.attachment!,
          }}
          size={{ width, height }}
          busy={false}
          error={null}
          share={() => {}}
          onLongPress={() =>
            ref.current?.measureInWindow((x, y, width, height) =>
              onSelect(message, { x, y, width, height }),
            )
          }
          accessibilityLabel={
            remaining ? t('messenger.morePhotos', { count: remaining }) : undefined
          }
          overlay={
            remaining ? (
              <View pointerEvents="none" style={styles.more}>
                <AppText style={styles.moreText}>+{remaining}</AppText>
              </View>
            ) : undefined
          }
        />
      ) : (
        <StateView
          loading={media.isPending}
          error={media.isError ? t('messenger.genericError') : undefined}
        />
      )}
      {!!reactions.data?.length && (
        <View pointerEvents="none" style={styles.reactions}>
          <AppText variant="caption">
            {[...new Set(reactions.data.map((row) => row.emoji))].join(' ')}
          </AppText>
        </View>
      )}
    </View>
  );
}

export function PhotoAlbum({
  photos,
  highlighted,
  menuOpen,
  onSelect,
  onReply,
}: {
  photos: LocalMessage[];
  highlighted: boolean;
  menuOpen: boolean;
  onSelect: (message: LocalMessage, anchor?: MessageAnchor) => void;
  onReply: (message: LocalMessage) => void;
}) {
  const { identity } = useDevice();
  const { width: viewport } = useWindowDimensions();
  const width = Math.min(340, (viewport - 32) * 0.86);
  const [measuredWidth, setMeasuredWidth] = useState(width);
  const cell = Math.max(0, (measuredWidth - 2) / 2);
  const latest = photos[photos.length - 1]!;
  return (
    <MessageTimeReveal onReply={menuOpen ? undefined : () => onReply(latest)}>
      <MessageBubble
        own={latest.sender === identity?.key}
        media
        visual
        interactiveChildren
        status={albumStatus(photos)}
        sentAt={latest.sentAt}
        highlighted={highlighted}
        containerStyle={{ width }}
      >
        <View
          style={styles.grid}
          testID="photo-album"
          onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
        >
          {photos.slice(0, 4).map((message, index) => (
            <AlbumPhoto
              key={message.id}
              message={message}
              width={photos.length === 3 && index === 0 ? measuredWidth : cell}
              height={cell}
              remaining={index === 3 && photos.length > 4 ? photos.length - 3 : 0}
              onSelect={onSelect}
            />
          ))}
        </View>
      </MessageBubble>
    </MessageTimeReveal>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  more: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: theme.colors.callText, fontSize: 36, lineHeight: 44 },
  reactions: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    paddingHorizontal: 5,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
  },
});
