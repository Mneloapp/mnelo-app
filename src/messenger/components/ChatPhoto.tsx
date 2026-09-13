import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
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
  square = false,
}: {
  uri: string;
  name: string;
  share: () => void;
  onLongPress: () => void;
  busy: boolean;
  error: string | null;
  square?: boolean;
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
            if (!nativeEvent.source) return;
            const { width, height } = nativeEvent.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
          style={[styles.thumbnail, { aspectRatio: square ? 1 : ratio }, square && styles.square]}
        />
      </Pressable>
      <Modal
        visible={open}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider>
          <ScreenAppearance.Provider value="call">
            {open && <StatusBar style="light" />}
            <SafeAreaView
              style={styles.viewer}
              accessibilityViewIsModal
              onAccessibilityEscape={() => setOpen(false)}
            >
              <View style={styles.toolbar}>
                <IconButton icon="x" label={t('compose.close')} onPress={() => setOpen(false)} />
                <AppText variant="label" numberOfLines={1} style={styles.name}>
                  {name}
                </AppText>
              </View>
              <ScrollView
                style={ui.flex}
                onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout)}
                contentContainerStyle={styles.fullPhoto}
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
                bouncesZoom
              >
                <Image
                  source={{ uri }}
                  resizeMode="contain"
                  accessibilityLabel={name}
                  style={{ width: viewport.width, height: viewport.height }}
                />
              </ScrollView>
              <Pressable
                style={styles.footer}
                accessibilityRole="button"
                accessibilityLabel={t('messenger.saveSharePhoto')}
                onPress={share}
                disabled={busy}
                accessibilityState={{ disabled: busy, busy }}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.callText} />
                ) : (
                  <AppIcon name="share" />
                )}
                <AppText variant="caption">{t('messenger.saveSharePhoto')}</AppText>
              </Pressable>
              {error && <AppText accessibilityRole="alert">{error}</AppText>}
            </SafeAreaView>
          </ScreenAppearance.Provider>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  square: { borderRadius: 0 },
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
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  name: { flex: 1, paddingRight: theme.spacing.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    minHeight: theme.controls.buttonHeight,
    justifyContent: 'center',
  },
});
