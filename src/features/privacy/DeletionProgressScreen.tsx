import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { repository } from '@/services';
import { AppText } from '@/components/AppText';
import { Button, Page, StateView } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { useSession } from '@/stores/session';
import { usePendingMessages } from '@/features/chats/pending-messages';
import { useDeletionState } from './deletion-state';
export function DeletionProgressScreen() {
  const { t } = useTranslation();
  const action = useAction();
  const cache = useQueryClient();
  const [status, setStatus] = useState<'processing' | 'deleted' | 'not_found'>(),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true,
      running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const value = await repository().accountDeletionStatus();
        if (alive) {
          setStatus(value);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [attempt]);
  const finish = async () => {
    await repository().clearAccountDeletionReceipt();
    if (status === 'deleted') await repository().forgetSession();
    cache.clear();
    usePendingMessages.getState().clear();
    if (status === 'deleted') useSession.getState().setSession(null);
    useDeletionState.getState().setPending(false);
  };
  return (
    <Page title={t('account.delete')}>
      <AppText variant="title">
        {t(
          status === undefined
            ? 'account.checkingDeletion'
            : status === 'deleted'
              ? 'account.deleted'
              : status === 'not_found'
                ? 'account.notSubmitted'
                : 'account.deletionProgress',
        )}
      </AppText>
      <AppText>
        {t(
          status === undefined
            ? 'account.checkingDeletionDetail'
            : status === 'deleted'
              ? 'account.deletedDetail'
              : status === 'not_found'
                ? 'account.notSubmittedDetail'
                : 'account.deletionProgressDetail',
        )}
      </AppText>
      {failed && (
        <StateView error={t('common.loadError')} onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {(status === undefined || status === 'processing') && !failed && <StateView loading />}
      {status === 'not_found' && (
        <Button
          label={t('common.retry')}
          busy={action.busy}
          onPress={() =>
            void action.run(async () => {
              await repository().requestAccountDeletion();
              setAttempt((n) => n + 1);
            })
          }
        />
      )}
      {(status === 'deleted' || status === 'not_found') && (
        <Button
          label={t(status === 'deleted' ? 'common.continue' : 'account.leaveUnsubmitted')}
          variant={status === 'deleted' ? 'primary' : 'secondary'}
          busy={action.busy}
          onPress={() => void action.run(finish)}
        />
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </Page>
  );
}
