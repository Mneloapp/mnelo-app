import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { IconButton, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { ScreenAppearance } from '@/theme/appearance';

export function ChatPhoto({
  uri,
  name,
  share,
  onLongPress,
  busy,
  error,
}: {
  uri: string;
  name: string;
  share: () => void;
  onLongPress: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(1);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const { t } = useTranslation();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('messenger.openPhoto')}
        onPress={() => setOpen(true)}
        onLongPress={onLongPress}
      >
        <Image
          source={{ uri }}
          resizeMode="cover"
          accessibilityLabel={name}
          onLoad={({ nativeEvent }) => {
            const { width, height } = nativeEvent.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
          style={[styles.thumbnail, { aspectRatio: ratio }]}
        />
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <ScreenAppearance.Provider value="call">
          <SafeAreaView style={styles.viewer}>
            <View style={ui.row}>
              <IconButton icon="x" label={t('compose.close')} onPress={() => setOpen(false)} />
              <View style={ui.flex} />
              <IconButton
                icon="share"
                label={t('messenger.saveSharePhoto')}
                onPress={share}
                busy={busy}
              />
            </View>
            <ScrollView
              style={ui.flex}
              onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout)}
              contentContainerStyle={styles.fullPhoto}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
            >
              <Image
                source={{ uri }}
                resizeMode="contain"
                accessibilityLabel={name}
                style={{ width: viewport.width, height: viewport.height }}
              />
            </ScrollView>
            {error && <AppText accessibilityRole="alert">{error}</AppText>}
          </SafeAreaView>
        </ScreenAppearance.Provider>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  thumbnail: {
    width: '100%',
    maxHeight: theme.layout.photoPreviewHeight,
    borderRadius: theme.radii.md,
  },
  viewer: {
    flex: 1,
    backgroundColor: theme.colors.callBackground,
    paddingHorizontal: theme.spacing.sm,
  },
  fullPhoto: { flexGrow: 1 },
});
