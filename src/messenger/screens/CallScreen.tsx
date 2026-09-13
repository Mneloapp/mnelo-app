import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { router, useIsFocused, useLocalSearchParams, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/ui';
import { PeerAvatar } from '../components/ContactCard';
import { CallSurface } from '../components/CallSurface';
import { useDevice } from '../DeviceProvider';
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
  const endAction = useLocalAction();
  const started = useRef(false);
  const dismissed = useRef(false);
  const focused = useIsFocused();
  const call = useSyncExternalStore(calls?.subscribe ?? noSubscribe, calls?.snapshot ?? noCall);
  const active = call?.chat === id ? call : null;
  // A new outgoing call can initially see the previous call's retained terminal snapshot.
  const restarting = useRef(
    media && active && ['ended', 'failed'].includes(active.status) ? active.id : null,
  );
  const dismiss = useCallback(() => {
    if (!focused || dismissed.current) return;
    dismissed.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/calls');
  }, [focused]);
  useEffect(() => {
    if (active && ['ended', 'failed'].includes(active.status) && active.id !== restarting.current)
      dismiss();
  }, [active, dismiss]);
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
  const name = chat.data?.title ?? t('brand');
  const avatarPeer = active?.peer ?? peer?.key;
  return (
    <CallSurface
      call={active}
      title={name}
      avatar={
        avatarPeer ? (
          <PeerAvatar peer={avatarPeer} name={name} size="call" />
        ) : (
          <Avatar name={name} size="call" />
        )
      }
      available={Boolean(calls)}
      busy={action.busy}
      ending={endAction.busy}
      error={endAction.error ?? action.error}
      onBack={dismiss}
      onAccept={() =>
        void action.run(async () => {
          await calls?.accept();
        })
      }
      onEnd={() =>
        void endAction.run(async () => {
          await calls?.end();
        })
      }
      onMute={() => calls?.mute()}
      onSpeaker={() =>
        void action.run(async () => {
          await calls?.speaker();
        })
      }
      onCamera={() => calls?.camera()}
      onSwitchCamera={() =>
        void action.run(async () => {
          await calls?.switchCamera();
        })
      }
    />
  );
}
