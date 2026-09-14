import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { VideoPlayback } from '../VideoPlayback';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { IconButton, ui } from '@/components/ui';
import { ScreenAppearance } from '@/theme/appearance';
import { theme } from '@/theme/tokens';
import type { Media } from '../model';
import type { MediaDimensions } from '../media-preview';
import { prepareVideoPreview, type VideoPreview } from '../video-preview';

function VideoPlayer({ uri, name, close }: { uri: string; name: string; close: () => void }) {
  const { t } = useTranslation();
  return (
    <SafeAreaProvider>
      <ScreenAppearance.Provider value="call">
        <StatusBar style="light" />
        <SafeAreaView style={styles.viewer} accessibilityViewIsModal onAccessibilityEscape={close}>
          <View style={styles.toolbar}>
            <IconButton icon="x" label={t('compose.close')} onPress={close} />
            <AppText variant="label" numberOfLines={1} style={ui.flex}>
              {name}
            </AppText>
          </View>
          <VideoPlayback uri={uri} />
        </SafeAreaView>
      </ScreenAppearance.Provider>
    </SafeAreaProvider>
  );
}

export function ChatVideo({
  media,
  size,
  onDimensions,
  onLongPress,
}: {
  media: Media;
  size: MediaDimensions;
  onDimensions: (size: MediaDimensions) => void;
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const [asset, setAsset] = useState<VideoPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    let prepared: VideoPreview | null = null;
    void prepareVideoPreview(media)
      .then((result) => {
        if (!active) {
          result.dispose();
          return;
        }
        prepared = result;
        setAsset(result);
        if (result.thumbnail) onDimensions(result.thumbnail);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      prepared?.dispose();
    };
  }, [media, attempt, onDimensions]);
  return (
    <>
      <Pressable
        style={[styles.preview, size]}
        accessibilityRole="button"
        accessibilityLabel={t(failed ? 'common.retry' : 'messenger.openVideo')}
        accessibilityState={{ busy: !asset && !failed }}
        onPress={() => {
          if (failed) {
            setFailed(false);
            setAsset(null);
            setAttempt((value) => value + 1);
          } else if (asset) setOpen(true);
        }}
        onLongPress={onLongPress}
        delayLongPress={450}
      >
        {asset?.thumbnail && (
          <Image
            source={{ uri: asset.thumbnail.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityLabel={media.name}
          />
        )}
        {!asset && !failed ? (
          <ActivityIndicator color={theme.colors.callText} />
        ) : (
          <View style={styles.play}>
            <AppIcon
              name={failed ? 'refresh-cw' : 'play'}
              color={theme.colors.callText}
              size={28}
            />
          </View>
        )}
        {failed && <AppText style={styles.error}>{t('messenger.videoUnavailable')}</AppText>}
        {!!media.duration && (
          <AppText style={styles.duration}>
            {Math.floor(media.duration / 60)}:
            {String(Math.floor(media.duration % 60)).padStart(2, '0')}
          </AppText>
        )}
      </Pressable>
      {open && asset && (
        <Modal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={() => setOpen(false)}
        >
          <VideoPlayer uri={asset.uri} name={media.name} close={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
const styles = StyleSheet.create({
  preview: {
    backgroundColor: theme.colors.callBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  error: { color: theme.colors.callText, padding: 16 },
  duration: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: theme.colors.callText,
    fontSize: 12,
    lineHeight: 16,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewer: { flex: 1, backgroundColor: theme.colors.callBackground },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
});
