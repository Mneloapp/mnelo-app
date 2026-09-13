import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Button, Field, IconButton, ui } from '@/components/ui';
import { ScreenAppearance } from '@/theme/appearance';
import { theme } from '@/theme/tokens';
import { parseContactLink } from '../contact-link';
import { pickContactCode } from '../pick-contact-code';
import { setInvitation } from '../pending-invitation';
import { useComposer } from './composer-navigation';

export function ScanContactScreen() {
  const { t } = useTranslation();
  const { finish, close } = useComposer();
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [picking, setPicking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<
    'card.cameraFailed' | 'card.invalidCode' | 'card.photoScanFailed' | null
  >(null);
  const [value, setValue] = useState('');
  const [frameSize, setFrameSize] = useState(0);
  const requested = useRef(false);
  const scanned = useRef(false);
  const active = useRef(false);
  const appActive = useRef(foreground);
  const generation = useRef(0);
  const pickerRunning = useRef(false);
  const pendingLink = useRef<string | null>(null);
  const cameraAccepting = useRef(false);

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setFocused(true);
      return () => {
        active.current = false;
        generation.current += 1;
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appActive.current = state === 'active';
      setForeground(appActive.current);
      if (!appActive.current) setTorch(false);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (focused && foreground) void refreshPermission().catch(() => setError('card.cameraFailed'));
  }, [focused, foreground, refreshPermission]);
  useEffect(() => {
    // Opening Scan is the user's camera action. Ask once, only for a first-time permission.
    if (!focused || !foreground || !permission || requested.current) return;
    requested.current = true;
    if (permission.status === 'undetermined') {
      void requestPermission().catch(() => setError('card.cameraFailed'));
    }
  }, [focused, foreground, permission, requestPermission]);

  const accept = useCallback(
    (data: string) => {
      if (!active.current || scanned.current) return;
      const contact = parseContactLink(data);
      if (!contact) {
        cameraAccepting.current = false;
        setError('card.invalidCode');
        setTorch(false);
        return;
      }
      scanned.current = true;
      setFinished(true);
      setTorch(false);
      setInvitation(contact);
      finish('/contact-invite');
    },
    [finish],
  );
  useEffect(() => {
    if (!picking || pickerRunning.current) return;
    // Start the OS picker after the render that removes the live camera.
    pickerRunning.current = true;
    const current = generation.current;
    void pickContactCode()
      .then((result) => {
        if (!active.current || current !== generation.current || result.cancelled) return;
        if (result.data) accept(result.data);
        else setError('card.invalidCode');
      })
      .catch(() => {
        if (active.current && current === generation.current) setError('card.photoScanFailed');
      })
      .finally(() => {
        pickerRunning.current = false;
        setPicking(false);
      });
  }, [picking, accept]);

  function leave(myCode = false) {
    active.current = false;
    generation.current += 1;
    setFinished(true);
    setTorch(false);
    if (myCode) router.dismissTo('/my-code');
    else if (router.canGoBack()) router.back();
    else close();
  }
  const cameraActive = Boolean(
    permission?.granted && focused && foreground && !manual && !picking && !finished && !error,
  );
  useLayoutEffect(() => {
    cameraAccepting.current = cameraActive;
  }, [cameraActive]);
  const denied = permission && !permission.granted && permission.status !== 'undetermined';

  return (
    <ScreenAppearance value="call">
      <View style={styles.screen}>
        {focused && !manual && <StatusBar style="light" />}
        {cameraActive && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (active.current && appActive.current && cameraAccepting.current) accept(data);
            }}
            onMountError={() => {
              setTorch(false);
              setError('card.cameraFailed');
            }}
          />
        )}
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <IconButton icon="x" label={t('compose.close')} onPress={() => leave()} />
            <IconButton
              icon={torch ? 'zap' : 'zap-off'}
              label={t(torch ? 'card.torchOff' : 'card.torchOn')}
              disabled={!cameraActive}
              onPress={() => setTorch((on) => !on)}
            />
          </View>
          <View
            style={styles.viewfinder}
            onLayout={({ nativeEvent: { layout } }) =>
              setFrameSize(Math.max(0, Math.min(layout.width - 48, layout.height - 32, 360)))
            }
          >
            <View style={styles.mask} />
            <View style={styles.frameRow}>
              <View style={styles.mask} />
              <View
                testID="qr-scan-frame"
                style={[styles.frame, { width: frameSize, height: frameSize }]}
                accessible={false}
              >
                {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
                  <View key={corner} style={[styles.corner, styles[corner]]} />
                ))}
              </View>
              <View style={styles.mask} />
            </View>
            <View style={styles.mask} />
            {(denied || error || picking || !permission) && (
              <View style={styles.notice}>
                {picking || !permission ? (
                  <ActivityIndicator
                    color={theme.colors.accent}
                    accessibilityLabel={t('common.loading')}
                  />
                ) : (
                  <>
                    <AppText centered accessibilityRole="alert">
                      {t(error ?? 'card.cameraDenied')}
                    </AppText>
                    <Button
                      variant="accent"
                      label={t(
                        denied && !permission.canAskAgain ? 'card.settings' : 'card.scanAgain',
                      )}
                      onPress={() => {
                        setError(null);
                        if (denied) {
                          void (
                            permission.canAskAgain ? requestPermission() : Linking.openSettings()
                          ).catch(() => setError('card.cameraFailed'));
                        }
                      }}
                    />
                  </>
                )}
              </View>
            )}
          </View>
          <View style={styles.footer}>
            <AppText centered variant="caption" style={styles.hint}>
              {t('card.scanHint')}
            </AppText>
            <View style={styles.actions}>
              <IconButton
                icon="image"
                label={t('card.scanPhoto')}
                disabled={picking || finished}
                onPress={() => {
                  setTorch(false);
                  setError(null);
                  setPicking(true);
                }}
              />
              <View style={styles.myCode}>
                <Button variant="secondary" label={t('card.myCode')} onPress={() => leave(true)} />
              </View>
              <IconButton
                icon="link"
                label={t('card.paste')}
                disabled={picking || finished}
                onPress={() => {
                  setTorch(false);
                  setError(null);
                  setManual(true);
                }}
              />
            </View>
          </View>
        </SafeAreaView>
        <ScreenAppearance value="light">
          <ActionSheet
            visible={manual}
            compact
            title={t('card.link')}
            onClose={() => {
              pendingLink.current = null;
              setError(null);
              setManual(false);
            }}
            onDismiss={() => {
              const data = pendingLink.current;
              pendingLink.current = null;
              if (data) accept(data);
            }}
          >
            <Field
              label={t('card.link')}
              value={value}
              maxLength={600}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setValue}
            />
            <View style={ui.stack}>
              <Button
                variant="secondary"
                label={t('card.paste')}
                onPress={() => {
                  void Clipboard.getStringAsync()
                    .then((text) => {
                      if (text.length > 600) setError('card.invalidCode');
                      else setValue(text);
                    })
                    .catch(() => setError('card.invalidCode'));
                }}
              />
              <Button
                variant="accent"
                label={t('common.continue')}
                disabled={!value.trim()}
                onPress={() => {
                  if (!parseContactLink(value)) {
                    setError('card.invalidCode');
                    return;
                  }
                  pendingLink.current = value;
                  setFinished(true);
                  setError(null);
                  setManual(false);
                }}
              />
              {error && <AppText accessibilityRole="alert">{t(error)}</AppText>}
            </View>
          </ActionSheet>
        </ScreenAppearance>
      </View>
    </ScreenAppearance>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.callBackground },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#00000066',
  },
  viewfinder: { flex: 1 },
  mask: { flex: 1, backgroundColor: '#00000066' },
  frameRow: { flexDirection: 'row' },
  frame: { position: 'relative' },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: theme.colors.accent },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  notice: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    padding: 40,
    gap: 24,
    backgroundColor: '#111111E8',
  },
  footer: { padding: 24, gap: 24, backgroundColor: '#00000066' },
  hint: { color: theme.colors.callText },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  myCode: { flexShrink: 1 },
});
