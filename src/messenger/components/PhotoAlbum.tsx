import { useRef } from 'react';
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
  wide,
  remaining,
  onSelect,
}: {
  message: LocalMessage;
  wide: boolean;
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
    <View ref={ref} collapsable={false} style={[styles.cell, wide && styles.wideCell]}>
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
          size={{ width: '100%', height: '100%' }}
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
  onInfo,
}: {
  photos: LocalMessage[];
  highlighted: boolean;
  menuOpen: boolean;
  onSelect: (message: LocalMessage, anchor?: MessageAnchor) => void;
  onReply: (message: LocalMessage) => void;
  onInfo?: ((message: LocalMessage) => void) | undefined;
}) {
  const { identity } = useDevice();
  const { width: viewport } = useWindowDimensions();
  const width = Math.min(340, (viewport - 32) * 0.86);
  const visible = photos.slice(0, 4);
  // Explicit rows let Yoga divide the available width. Wrapping two measured
  // half-widths can put every tile on its own row after pixel rounding on iOS.
  const rows =
    visible.length === 3
      ? [visible.slice(0, 1), visible.slice(1)]
      : [visible.slice(0, 2), visible.slice(2)].filter((row) => row.length);
  const latest = photos[photos.length - 1]!;
  return (
    <MessageTimeReveal
      onReply={menuOpen ? undefined : () => onReply(latest)}
      onInfo={!menuOpen && onInfo ? () => onInfo(latest) : undefined}
    >
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
        <View style={styles.grid} testID="photo-album">
          {rows.map((row) => (
            <View key={row[0]!.id} style={styles.gridRow}>
              {row.map((message) => (
                <AlbumPhoto
                  key={message.id}
                  message={message}
                  wide={row.length === 1}
                  remaining={message === visible[3] && photos.length > 4 ? photos.length - 3 : 0}
                  onSelect={onSelect}
                />
              ))}
            </View>
          ))}
        </View>
      </MessageBubble>
    </MessageTimeReveal>
  );
}
const styles = StyleSheet.create({
  grid: { gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  cell: { flex: 1, minWidth: 0, aspectRatio: 1, overflow: 'hidden' },
  wideCell: { aspectRatio: 2 },
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
