import { useEffect, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { SheetAction } from '@/components/SheetAction';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import type { LocalCall } from '../model';
import { useLocalAction } from './shared';

const noSubscribe = () => () => {};
const noCall = () => null;
export function useCurrentCall() {
  const { calls } = useDevice();
  const call = useSyncExternalStore(calls?.subscribe ?? noSubscribe, calls?.snapshot ?? noCall);
  return call && !['ended', 'failed'].includes(call.status) ? call : null;
}
export function CurrentCall({
  onNavigate,
  onOpen,
}: {
  onNavigate?: () => void;
  onOpen?: ((id: string) => void) | undefined;
}) {
  const call = useCurrentCall();
  const { t } = useTranslation();
  return call ? (
    <Button
      label={t('messenger.callReturn')}
      onPress={() => {
        onNavigate?.();
        if (onOpen) onOpen(call.chat);
        else router.push({ pathname: '/call/[id]', params: { id: call.chat } });
      }}
    />
  ) : null;
}
export type CallTarget = { key: string; name: string; history?: LocalCall };
export function CallActions({
  target,
  onClose,
  onStarted,
}: {
  target: CallTarget;
  onClose: () => void;
  onStarted?: (id: string) => void;
}) {
  const { engine, calls, mesh, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const current = useCurrentCall();
  const contacts = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => view.contacts(),
    networkMode: 'always',
  });
  const trusted = contacts.data?.some((item) => item.key === target.key && !item.blocked);
  useEffect(() => {
    if (trusted) void mesh?.focus(target.key).catch(() => undefined);
  }, [mesh, target.key, trusted]);
  const available = Boolean(
    calls &&
    (target.history?.group
      ? calls.supportsQueuedSignaling
      : trusted && (calls.supportsQueuedSignaling || mesh?.online(target.key))),
  );
  function start(media: 'voice' | 'video') {
    void action.run(async () => {
      if (!calls || !available || current) return;
      if (target.history?.group) {
        onClose();
        router.push({ pathname: '/call/[id]', params: { id: target.history.chatId, media } });
        return;
      }
      const saved = (await engine.contacts()).find((c) => c.key === target.key && !c.blocked);
      if (!saved) return;
      const id = await engine.trustContact({ key: saved.key, name: saved.name });
      await calls.start(target.key, media);
      onClose();
      if (onStarted) onStarted(id);
      else router.push({ pathname: '/call/[id]', params: { id } });
    });
  }
  return (
    <ActionSheet
      visible
      title={
        target.history?.group
          ? target.name
          : (contacts.data?.find((c) => c.key === target.key)?.name ?? target.name)
      }
      onClose={onClose}
    >
      <CurrentCall onNavigate={onClose} onOpen={onStarted} />
      {!available && <AppText tone="secondary">{t('messenger.callUnavailable')}</AppText>}
      <SheetAction
        icon="phone"
        label={t('messenger.callVoice')}
        disabled={!available || Boolean(current) || action.busy}
        onPress={() => start('voice')}
      />
      <SheetAction
        icon="video"
        label={t('messenger.callVideo')}
        disabled={!available || Boolean(current) || action.busy}
        onPress={() => start('video')}
      />
      {target.history && (
        <>
          <SheetAction
            icon="message-circle"
            disabled={action.busy}
            label={t('messenger.callOpenChat')}
            onPress={() => {
              onClose();
              router.push({ pathname: '/chat/[id]', params: { id: target.history!.chatId } });
            }}
          />
          <SheetAction
            icon="trash-2"
            danger
            label={t('messenger.callHistoryDelete')}
            disabled={action.busy}
            onPress={() =>
              Alert.alert(t('messenger.callHistoryDelete'), t('messenger.callHistoryDeleteHint'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('messenger.callHistoryDelete'),
                  style: 'destructive',
                  onPress: () =>
                    void action.run(async () => {
                      await engine.deleteLocalMessage(target.history!.id);
                      onClose();
                    }),
                },
              ])
            }
          />
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      <SheetAction icon="x" label={t('common.cancel')} onPress={onClose} />
    </ActionSheet>
  );
}
