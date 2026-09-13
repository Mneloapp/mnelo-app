import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { ScreenAppearance } from '@/theme/appearance';
import { theme } from '@/theme/tokens';
import type { DeviceCall } from '../calls';
import { VideoView } from '../VideoView';

export function CallSurface({
  call,
  title,
  avatar,
  available,
  busy,
  ending,
  error,
  onBack,
  onAccept,
  onEnd,
  onMute,
  onSpeaker,
  onCamera,
  onSwitchCamera,
}: {
  call: DeviceCall | null;
  title: string;
  avatar: ReactNode;
  available: boolean;
  busy: boolean;
  ending: boolean;
  error: string | null;
  onBack: () => void;
  onAccept: () => void;
  onEnd: () => void;
  onMute: () => void;
  onSpeaker: () => void;
  onCamera: () => void;
  onSwitchCamera: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [stageHeight, setStageHeight] = useState(0);
  const previewHeight = Math.min(156, Math.max(0, stageHeight - theme.spacing.lg * 2));
  const terminal = call?.status === 'ended' || call?.status === 'failed';
  const video = call?.media === 'video' && !terminal;
  const remoteVideo = Boolean(video && call?.remote?.getVideoTracks().length);
  const localVideo = video && call?.camera ? call.local : null;
  const backdrop = remoteVideo || Boolean(localVideo);
  const incoming = call?.status === 'incoming';
  const status = t(
    call?.status === 'failed'
      ? 'messenger.callFailed'
      : call?.status === 'ended'
        ? 'messenger.callEnded'
        : incoming
          ? 'messenger.callIncoming'
          : call?.status === 'active'
            ? 'calls.connected'
            : call?.status === 'connecting'
              ? 'calls.connecting'
              : available
                ? 'calls.ringing'
                : 'messenger.callUnavailable',
  );
  return (
    <ScreenAppearance.Provider value="call">
      <View style={styles.screen}>
        <StatusBar style="light" />
        {call?.remote && !terminal && (
          <View
            testID={remoteVideo ? 'call-remote-video' : 'call-audio'}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={remoteVideo ? styles.backdrop : styles.audio}
          >
            <VideoView stream={call.remote} />
          </View>
        )}
        {localVideo && !remoteVideo && (
          <View testID="call-local-video" pointerEvents="none" style={styles.backdrop}>
            <VideoView stream={localVideo} local />
          </View>
        )}
        <View style={styles.chrome} pointerEvents="box-none">
          <View
            style={[
              styles.header,
              { paddingTop: insets.top + theme.spacing.md },
              backdrop && styles.headerOverVideo,
            ]}
          >
            <CallControl icon="chevron-down" label={t('calls.returnToChat')} onPress={onBack} />
            <View style={styles.heading}>
              <AppText variant="headline" centered numberOfLines={2} accessibilityRole="header">
                {title}
              </AppText>
              <AppText variant="caption" centered tone="secondary" accessibilityLiveRegion="polite">
                {status}
              </AppText>
            </View>
            {video && call?.local ? (
              <CallControl
                icon="refresh-cw"
                label={t('messenger.switchCamera')}
                disabled={busy || ending || !call.camera}
                onPress={onSwitchCamera}
              />
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>
          <View
            testID="call-stage"
            style={styles.stage}
            pointerEvents="box-none"
            onLayout={({ nativeEvent }) => setStageHeight(nativeEvent.layout.height)}
          >
            {!backdrop && (
              <ScrollView
                contentContainerStyle={styles.identity}
                showsVerticalScrollIndicator={false}
              >
                {avatar}
              </ScrollView>
            )}
            {remoteVideo && localVideo && previewHeight >= theme.controls.minTapTarget && (
              <View
                testID="call-self-preview"
                style={[
                  styles.selfPreview,
                  { height: previewHeight, width: (previewHeight * 2) / 3 },
                ]}
                pointerEvents="none"
              >
                <VideoView stream={localVideo} local />
              </View>
            )}
          </View>
          <View
            style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}
          >
            {error && (
              <AppText variant="caption" centered accessibilityRole="alert" style={styles.error}>
                {error}
              </AppText>
            )}
            <View style={styles.controls}>
              {incoming ? (
                <>
                  <CallControl
                    icon="phone"
                    label={t('messenger.callDecline')}
                    caption={t('messenger.callDecline')}
                    variant="end"
                    disabled={ending}
                    onPress={onEnd}
                  />
                  <CallControl
                    icon="phone"
                    label={t('messenger.callAccept')}
                    caption={t('messenger.callAccept')}
                    variant="accept"
                    disabled={busy || ending}
                    onPress={onAccept}
                  />
                </>
              ) : call && !terminal ? (
                <>
                  {video && (
                    <CallControl
                      icon={call.camera ? 'video' : 'video-off'}
                      label={t(call.camera ? 'messenger.cameraOff' : 'messenger.cameraOn')}
                      caption={t('calls.controlCamera')}
                      selected={!call.camera}
                      disabled={busy || ending || !call.local}
                      onPress={onCamera}
                    />
                  )}
                  <CallControl
                    icon="volume-2"
                    label={t(call.speaker ? 'messenger.earpiece' : 'messenger.speaker')}
                    caption={t('messenger.speaker')}
                    selected={call.speaker}
                    disabled={busy || ending}
                    onPress={onSpeaker}
                  />
                  <CallControl
                    icon={call.muted ? 'mic-off' : 'mic'}
                    label={t(call.muted ? 'messenger.unmute' : 'messenger.mute')}
                    caption={t('calls.controlMute')}
                    selected={call.muted}
                    disabled={busy || ending || !call.local}
                    onPress={onMute}
                  />
                  <CallControl
                    icon="phone"
                    label={t('messenger.callEnd')}
                    caption={t('calls.controlEnd')}
                    variant="end"
                    disabled={ending}
                    onPress={onEnd}
                  />
                </>
              ) : (
                <CallControl
                  icon="chevron-left"
                  label={t('common.back')}
                  caption={t('common.back')}
                  onPress={onBack}
                />
              )}
            </View>
          </View>
        </View>
      </View>
    </ScreenAppearance.Provider>
  );
}

function CallControl({
  icon,
  label,
  caption,
  selected,
  disabled = false,
  variant,
  onPress,
}: {
  icon: IconName;
  label: string;
  caption?: string;
  selected?: boolean;
  disabled?: boolean;
  variant?: 'end' | 'accept';
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected !== undefined ? { selected } : {}) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        caption ? styles.control : styles.headerControl,
        (disabled || pressed) && styles.dimmed,
      ]}
    >
      <View
        style={[
          styles.circle,
          selected && styles.selected,
          variant === 'end' && styles.end,
          variant === 'accept' && styles.accept,
        ]}
      >
        <View style={variant === 'end' && styles.hangup}>
          <AppIcon
            name={icon}
            color={selected || variant === 'accept' ? theme.colors.black : theme.colors.callText}
          />
        </View>
      </View>
      {caption && (
        <AppText variant="caption" centered style={styles.caption}>
          {caption}
        </AppText>
      )}
    </FocusPressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.callBackground },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  audio: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  chrome: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  headerOverVideo: { backgroundColor: 'rgba(17,17,17,0.78)' },
  heading: { flex: 1, gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
  headerSpacer: { width: theme.controls.minTapTarget },
  headerControl: {
    width: theme.controls.minTapTarget,
    minHeight: theme.controls.minTapTarget,
    alignItems: 'center',
  },
  stage: { flex: 1, minHeight: 0 },
  identity: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  selfPreview: {
    position: 'absolute',
    right: theme.spacing.lg,
    bottom: theme.spacing.lg,
    width: 104,
    height: 156,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    borderWidth: theme.controls.borderWidth,
    borderColor: theme.colors.callSecondary,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.xl,
    backgroundColor: 'rgba(42,42,42,0.96)',
  },
  control: {
    flex: 1,
    minWidth: theme.controls.minTapTarget,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  caption: { width: '100%' },
  circle: {
    width: theme.controls.minTapTarget,
    height: theme.controls.minTapTarget,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.callBackground,
  },
  selected: { backgroundColor: theme.colors.surface },
  end: { backgroundColor: theme.colors.endCall },
  accept: { backgroundColor: theme.colors.accent },
  hangup: { transform: [{ rotate: '135deg' }] },
  dimmed: { opacity: theme.opacity.disabled },
  error: {
    color: theme.colors.callError,
    backgroundColor: theme.colors.callBackground,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
});
