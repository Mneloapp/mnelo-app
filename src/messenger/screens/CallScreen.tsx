import { useEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, IconButton, Page, ui } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { ScreenAppearance } from '@/theme/appearance';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import { VideoView } from '../VideoView';
import { useLocalAction } from './shared';
import { useAppActive } from '@/hooks/useAppActive';
import { systemCallAudio } from '../system-calls';
const noSubscribe = () => () => {};
const noCall = () => null;
export function IncomingCalls() {
  const { calls } = useDevice();
  const call = useSyncExternalStore(calls?.subscribe ?? noSubscribe, calls?.snapshot ?? noCall);
  const active = useAppActive();
  const path = usePathname();
  const presented = useRef<string | null>(null);
  useEffect(() => {
    const present =
      call?.incoming &&
      (systemCallAudio()
        ? call.status === 'connecting' || call.status === 'active'
        : call.status === 'incoming');
    if (active && present && call && presented.current !== call.id) {
      presented.current = call.id;
      if (path !== '/call/' + call.chat)
        router.push({ pathname: '/call/[id]', params: { id: call.chat } });
    }
  }, [active, path, call]);
  return null;
}
export function CallScreen() {
  const { id, media } = useLocalSearchParams<{ id: string; media?: 'voice' | 'video' }>();
  const { identity, calls, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const started = useRef(false);
  const call = useSyncExternalStore(calls?.subscribe ?? noSubscribe, calls?.snapshot ?? noCall);
  const chat = useQuery({
    queryKey: ['device', 'chat', id],
    queryFn: () => view.chat(id),
    networkMode: 'always',
  });
  const members = useQuery({
    queryKey: ['device', 'members', id],
    queryFn: () => view.members(id),
    networkMode: 'always',
  });
  const peer = members.data?.find((member) => member.key !== identity?.key);
  useEffect(() => {
    if (started.current || !calls || !peer || !media || chat.data?.kind !== 'direct') return;
    started.current = true;
    if (call && call.chat === id && !['ended', 'failed'].includes(call.status)) return;
    void action.run(() => calls.start(peer.key, media));
  }, [action, call, calls, chat.data?.kind, id, media, peer]);
  const active = call?.chat === id ? call : null;
  const terminal = active?.status === 'ended' || active?.status === 'failed';
  return (
    <ScreenAppearance.Provider value="call">
      <Page
        title={t(
          media === 'video' || active?.media === 'video'
            ? 'messenger.callVideo'
            : 'messenger.callVoice',
        )}
        back
      >
        <View style={[ui.center, styles.identity]}>
          <Avatar name={chat.data?.title ?? t('brand')} size="large" />
          <AppText variant="title" centered>
            {chat.data?.title}
          </AppText>
          <AppText centered tone="secondary">
            {t(
              active?.status === 'incoming'
                ? 'messenger.callIncoming'
                : active?.status === 'failed'
                  ? 'messenger.callFailed'
                  : active?.status === 'ended'
                    ? 'messenger.callEnded'
                    : active?.status === 'active'
                      ? 'messenger.peerOnline'
                      : calls
                        ? 'messenger.callWaiting'
                        : 'messenger.callUnavailable',
            )}
          </AppText>
          {terminal && active?.diagnostic && (
            <AppText variant="caption" tone="secondary">
              {active.diagnostic}
            </AppText>
          )}
        </View>
        {active?.remote && (
          <View style={styles.remote}>
            <VideoView stream={active.remote} />
          </View>
        )}
        {active?.local && active.media === 'video' && (
          <View style={styles.local}>
            <VideoView stream={active.local} local />
          </View>
        )}
        {active?.status === 'incoming' ? (
          <>
            <Button
              label={t('messenger.callAccept')}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  await calls?.accept();
                })
              }
            />
            <Button
              variant="danger"
              label={t('messenger.callDecline')}
              onPress={() =>
                void action.run(async () => {
                  await calls?.end();
                })
              }
            />
          </>
        ) : active && !terminal ? (
          <>
            <View style={ui.row}>
              <IconButton
                icon={active.muted ? 'mic-off' : 'mic'}
                label={t(active.muted ? 'messenger.unmute' : 'messenger.mute')}
                onPress={() => calls?.mute()}
              />
              <IconButton
                icon="volume-2"
                label={t(active.speaker ? 'messenger.earpiece' : 'messenger.speaker')}
                onPress={() =>
                  void action.run(async () => {
                    await calls?.speaker();
                  })
                }
              />
              {active.media === 'video' && (
                <>
                  <IconButton
                    icon={active.camera ? 'video' : 'video-off'}
                    label={t(active.camera ? 'messenger.cameraOff' : 'messenger.cameraOn')}
                    onPress={() => calls?.camera()}
                  />
                  <IconButton
                    icon="refresh-cw"
                    label={t('messenger.switchCamera')}
                    onPress={() =>
                      void action.run(async () => {
                        await calls?.switchCamera();
                      })
                    }
                  />
                </>
              )}
            </View>
            <Button
              variant="danger"
              label={t('messenger.callEnd')}
              onPress={() =>
                void action.run(async () => {
                  await calls?.end();
                })
              }
            />
          </>
        ) : (
          <Button variant="secondary" label={t('common.back')} onPress={() => router.back()} />
        )}
        {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      </Page>
    </ScreenAppearance.Provider>
  );
}
const styles = StyleSheet.create({
  identity: { paddingVertical: theme.spacing.xxl, gap: theme.spacing.lg },
  remote: {
    height: theme.layout.callVideoHeight,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
  },
  local: {
    height: theme.layout.callSelfHeight,
    width: theme.layout.callSelfWidth,
    alignSelf: 'flex-end',
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
});
