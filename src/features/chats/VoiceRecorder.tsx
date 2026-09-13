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
import { VoiceRecordingPanel } from './VoiceRecordingPanel';
import { MAX_VOICE_SAMPLES, VOICE_METER_INTERVAL, voiceLevel } from './voice-waveform';
export function VoiceRecorder({
  onReady,
  disabled = false,
  autoStart = false,
  onCancel,
  onSend,
}: {
  onReady: (file: SelectedMedia | null) => void;
  disabled?: boolean;
  autoStart?: boolean;
  onCancel?: () => void;
  onSend?: () => void;
}) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [recordedMillis, setRecordedMillis] = useState(0);
  const lastDuration = useRef(0);
  const cancelling = useRef(false);
  const mounted = useRef(true);
  const samples = useRef<number[]>([]);
  const [previewWaveform, setPreviewWaveform] = useState<number[]>([]);
  const lastSampleTime = useRef(-1);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelling.current = true;
    };
  }, []);
  const recorder = useAudioRecorder(
    {
      ...RecordingPresets.HIGH_QUALITY,
      numberOfChannels: 1,
      bitRate: 64000,
      isMeteringEnabled: true,
    },
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
          setPreviewWaveform(samples.current.slice());
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
  const status = useAudioRecorderState(recorder, VOICE_METER_INTERVAL);
  const [levels, setLevels] = useState<number[]>([]);
  useEffect(() => {
    // Android clears its native duration on stop. Keep the observed recording duration
    // for the preview, including automatic/background stops between polling ticks.
    if (!status.isRecording) return;
    lastDuration.current = status.durationMillis;
    if (status.durationMillis <= lastSampleTime.current) return;
    lastSampleTime.current = status.durationMillis;
    if (samples.current.length < MAX_VOICE_SAMPLES)
      samples.current.push(voiceLevel(status.metering));
    // Only the short rolling window redraws while recording; full draft data stays local in memory.
    setLevels(samples.current.slice(-56));
  }, [status.isRecording, status.durationMillis, status.metering]);
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
    samples.current = [];
    lastSampleTime.current = -1;
    setLevels([]);
    setPreviewWaveform([]);
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
      <VoiceRecordingPanel
        samples={levels}
        seconds={(status.isRecording ? status.durationMillis : recordedMillis) / 1000}
        recording={status.isRecording}
        preparing={a.busy}
        disabled={disabled}
        ready={Boolean(uri)}
        deleteLabel={t(autoStart ? 'common.delete' : 'common.cancel')}
        onSend={onSend}
        preview={
          uri ? (
            <AudioPlayback
              uri={uri}
              durationSeconds={recordedMillis / 1000}
              waveform={previewWaveform}
              disabled={disabled || a.busy}
            />
          ) : undefined
        }
        onToggle={() =>
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
        onDelete={() =>
          void a.run(async () => {
            cancelling.current = true;
            if (status.isRecording) await recorder.stop();
            if (uri) discardCachedMedia(uri);
            setUri(null);
            setRecordedMillis(0);
            lastDuration.current = 0;
            samples.current = [];
            lastSampleTime.current = -1;
            setLevels([]);
            setPreviewWaveform([]);
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
