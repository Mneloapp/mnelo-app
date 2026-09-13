import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button, ui } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { AudioPlayback } from './AudioPlayback';
import { discardCachedMedia, type SelectedMedia } from './media-files';
export function VoiceRecorder({
  onReady,
  disabled = false,
  autoStart = false,
  onCancel,
}: {
  onReady: (file: SelectedMedia | null) => void;
  disabled?: boolean;
  autoStart?: boolean;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [recordedMillis, setRecordedMillis] = useState(0);
  const lastDuration = useRef(0);
  const cancelling = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelling.current = true;
    };
  }, []);
  const recorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 },
    (event) => {
      if (!mounted.current) {
        if (event.url) discardCachedMedia(event.url);
        return;
      }
      if (event.hasError || event.mediaServicesDidReset) {
        setInterrupted(true);
        onReady(null);
      }
      if (event.isFinished) {
        void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        if (cancelling.current) {
          if (event.url) discardCachedMedia(event.url);
          return;
        }
        if (event.url && !event.hasError) {
          setRecordedMillis((previous) => Math.max(previous, lastDuration.current));
          setUri(event.url);
          onReady({
            uri: event.url,
            name: 'voice.m4a',
            mime: 'audio/mp4',
            duration: lastDuration.current / 1000,
          });
        }
      }
    },
  );
  const status = useAudioRecorderState(recorder, 250);
  useEffect(() => {
    // Android clears its native duration on stop. Keep the observed recording duration
    // for the preview, including automatic/background stops between polling ticks.
    if (status.isRecording) lastDuration.current = status.durationMillis;
  }, [status.isRecording, status.durationMillis]);
  const a = useAction();
  const focused = useIsFocused();
  useEffect(() => {
    if (status.isRecording && !focused) void recorder.stop().catch(() => setInterrupted(true));
  }, [recorder, status.isRecording, focused]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && recorder.getStatus().isRecording)
        void recorder.stop().catch(() => setInterrupted(true));
    });
    return () => {
      sub.remove();
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    };
  }, [recorder]);
  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!mounted.current) return;
    if (!permission.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setInterrupted(false);
    cancelling.current = false;
    setRecordedMillis(0);
    lastDuration.current = 0;
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
    await recorder.prepareToRecordAsync();
    if (!mounted.current) {
      await setAudioModeAsync({ allowsRecording: false });
      return;
    }
    recorder.record({ forDuration: 600 });
  }
  const startRef = useRef(startRecording);
  useEffect(() => {
    startRef.current = startRecording;
  });
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current || Platform.OS === 'web') return;
    started.current = true;
    void a.run(() => startRef.current());
  }, [autoStart, a]);
  if (Platform.OS === 'web') return <AppText tone="secondary">{t('media.nativeVoice')}</AppText>;
  return (
    <View style={ui.stack}>
      {!autoStart && <AppText variant="bodyMedium">{t('chat.voiceMessage')}</AppText>}
      <AppText>
        {t('media.recordedTime', {
          seconds: Math.floor((status.isRecording ? status.durationMillis : recordedMillis) / 1000),
        })}
      </AppText>
      {uri ? (
        <AudioPlayback uri={uri} durationSeconds={recordedMillis / 1000} />
      ) : (
        <Button
          label={t(status.isRecording ? 'media.stop' : 'media.record')}
          busy={a.busy}
          disabled={disabled}
          onPress={() =>
            void a.run(async () => {
              if (status.isRecording) {
                const elapsed = recorder.getStatus().durationMillis;
                lastDuration.current = Math.max(lastDuration.current, elapsed);
                setRecordedMillis((previous) => Math.max(previous, elapsed));
                await recorder.stop();
                return;
              }
              await startRecording();
            })
          }
        />
      )}
      <Button
        variant="secondary"
        label={t(autoStart ? 'common.delete' : 'common.cancel')}
        disabled={disabled || a.busy}
        onPress={() =>
          void a.run(async () => {
            cancelling.current = true;
            if (status.isRecording) await recorder.stop();
            if (uri) discardCachedMedia(uri);
            setUri(null);
            setRecordedMillis(0);
            lastDuration.current = 0;
            onReady(null);
            await setAudioModeAsync({ allowsRecording: false });
            onCancel?.();
          })
        }
      />
      {denied && (
        <>
          <AppText accessibilityRole="alert">{t('media.microphoneDenied')}</AppText>
          <Button
            variant="secondary"
            label={t('media.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </>
      )}
      {interrupted && (
        <AppText accessibilityRole="alert">{t('media.recordingInterrupted')}</AppText>
      )}
      {a.error && <AppText accessibilityRole="alert">{a.error}</AppText>}
    </View>
  );
}
