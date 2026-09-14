import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
export function VideoPlayback({ uri }: { uri: string }) {
  const { t } = useTranslation();
  const player = useVideoPlayer(null);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    let active = true;
    void player
      .replaceAsync(uri)
      .then(() => {
        if (active) player.play();
      })
      .catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [player, uri]);
  return (
    <View style={ui.flex}>
      <VideoView
        player={player}
        style={ui.flex}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture={false}
      />
      {status === 'loading' && <ActivityIndicator color={theme.colors.callText} />}
      {status === 'error' && (
        <AppText accessibilityRole="alert">{t('messenger.videoUnavailable')}</AppText>
      )}
    </View>
  );
}
