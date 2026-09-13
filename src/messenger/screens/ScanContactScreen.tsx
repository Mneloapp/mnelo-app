import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, Field, Page, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { parseContactLink } from '../contact-link';
import { setInvitation } from '../pending-invitation';
import { useComposer } from './composer-navigation';
import { useLocalAction } from './shared';

export function ScanContactScreen() {
  const { t } = useTranslation();
  const { finish } = useComposer();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false),
    [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [camera, setCamera] = useState(false),
    [invalid, setInvalid] = useState(false),
    [value, setValue] = useState('');
  const scanned = useRef(false);
  const [cameraError, setCameraError] = useState(false);
  const action = useLocalAction();
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  function accept(data: string) {
    if (scanned.current) return;
    scanned.current = true;
    setCamera(false);
    const contact = parseContactLink(data);
    if (!contact) {
      setInvalid(true);
      return;
    }
    setInvitation(contact);
    finish('/contact-invite');
  }
  return (
    <Page nativeHeader nativeKeyboardInsets>
      <AppText tone="secondary">{t('card.scanHint')}</AppText>
      {camera && permission?.granted && focused && foreground ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => accept(data)}
            onMountError={() => {
              setCamera(false);
              setCameraError(true);
            }}
          />
        </View>
      ) : (
        <View style={styles.ready}>
          <AppText centered>{t('card.scanPrivacy')}</AppText>
        </View>
      )}
      {!camera && (
        <Button
          label={t(invalid ? 'card.scanAgain' : 'card.camera')}
          busy={action.busy}
          onPress={() =>
            void action.run(async () => {
              const result = permission?.granted ? permission : await requestPermission();
              if (result.granted) {
                scanned.current = false;
                setInvalid(false);
                setCameraError(false);
                setCamera(true);
              }
            })
          }
        />
      )}
      {permission && !permission.granted && !permission.canAskAgain && (
        <>
          <AppText>{t('card.cameraDenied')}</AppText>
          <Button
            variant="secondary"
            label={t('card.settings')}
            onPress={() => void action.run(() => Linking.openSettings())}
          />
        </>
      )}
      {invalid && <AppText accessibilityRole="alert">{t('card.invalidCode')}</AppText>}
      {cameraError && <AppText accessibilityRole="alert">{t('card.cameraFailed')}</AppText>}
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
          onPress={() =>
            void action.run(async () => {
              const text = await Clipboard.getStringAsync();
              if (text.length > 600) {
                setInvalid(true);
                return;
              }
              setValue(text);
            })
          }
        />
        <Button
          variant="secondary"
          label={t('common.continue')}
          disabled={!value.trim()}
          onPress={() => {
            scanned.current = false;
            accept(value);
          }}
        />
      </View>
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
const styles = StyleSheet.create({
  camera: {
    height: theme.layout.qrSize,
    overflow: 'hidden',
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.black,
  },
  ready: {
    minHeight: theme.layout.qrSize,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surfaceSoft,
    padding: theme.spacing.xl,
    justifyContent: 'center',
  },
});
