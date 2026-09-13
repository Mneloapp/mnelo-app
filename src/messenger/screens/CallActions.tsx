import { useEffect, useSyncExternalStore } from 'react';
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
function useCurrentCall() {
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
  const { engine, calls, mesh } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const current = useCurrentCall();
  const contacts = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => engine.contacts(),
    networkMode: 'always',
  });
  const trusted = contacts.data?.some((item) => item.key === target.key && !item.blocked);
  useEffect(() => {
    if (trusted) void mesh?.focus(target.key).catch(() => undefined);
  }, [mesh, target.key, trusted]);
  const available = Boolean(
    trusted && calls && (calls.supportsQueuedSignaling || mesh?.online(target.key)),
  );
  function start(media: 'voice' | 'video') {
    void action.run(async () => {
      if (!calls || !available || current) return;
      const id = await engine.trustContact({ key: target.key, name: target.name });
      await calls.start(target.key, media);
      onClose();
      if (onStarted) onStarted(id);
      else router.push({ pathname: '/call/[id]', params: { id } });
    });
  }
  return (
    <ActionSheet visible title={target.name} onClose={onClose}>
      <CurrentCall onNavigate={onClose} onOpen={onStarted} />
      {!available && <AppText tone="secondary">{t('messenger.callUnavailable')}</AppText>}
      <Button
        label={t('messenger.callVoice')}
        disabled={!available || Boolean(current)}
        busy={action.busy}
        onPress={() => start('voice')}
      />
      <Button
        variant="secondary"
        label={t('messenger.callVideo')}
        disabled={!available || Boolean(current)}
        busy={action.busy}
        onPress={() => start('video')}
      />
      {target.history && (
        <>
          <Button
            variant="secondary"
            label={t('messenger.callOpenChat')}
            onPress={() => {
              onClose();
              router.push({ pathname: '/chat/[id]', params: { id: target.history!.chatId } });
            }}
          />
          <AppText variant="caption" tone="secondary">
            {t('messenger.callHistoryDeleteHint')}
          </AppText>
          <Button
            variant="danger"
            label={t('messenger.callHistoryDelete')}
            busy={action.busy}
            onPress={() =>
              void action.run(async () => {
                await engine.deleteLocalMessage(target.history!.id);
                onClose();
              })
            }
          />
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </ActionSheet>
  );
}
