import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Button, Field, StateView } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { useLocalAction } from '../screens/shared';

export function CallQuickReplies({
  onClose,
  onSend,
  editOnly = false,
}: {
  onClose: () => void;
  onSend?: (text: string) => Promise<void>;
  editOnly?: boolean;
}) {
  const { engine } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const [editing, setEditing] = useState(editOnly);
  const [draft, setDraft] = useState<string[] | null>(null);
  const q = useQuery({
    queryKey: ['device', 'call-quick-replies'],
    queryFn: () => engine.callQuickReplies(),
    networkMode: 'always',
  });
  const defaults = [
    t('messenger.callReplyMeeting'),
    t('messenger.callReplyLater'),
    t('messenger.callReplySoon'),
  ];
  const replies = draft ?? (q.data?.length === 3 ? q.data : defaults);
  return (
    <ActionSheet
      visible
      title={t('messenger.callQuickReplies')}
      onClose={() => {
        if (!action.busy) onClose();
      }}
      avoidKeyboard
    >
      <AppText variant="caption" tone="secondary">
        {t('messenger.callQuickRepliesHint')}
      </AppText>
      {(q.isPending || q.isError) && (
        <StateView
          loading={q.isPending}
          error={q.isError ? t('messenger.genericError') : undefined}
        />
      )}
      {!q.isPending &&
        !q.isError &&
        (editing ? (
          <>
            {replies.map((reply, index) => (
              <Field
                key={index}
                label={t('messenger.callQuickReplyLabel', { number: index + 1 })}
                value={reply}
                multiline
                maxLength={240}
                editable={!action.busy}
                onChangeText={(text) =>
                  setDraft(replies.map((value, position) => (position === index ? text : value)))
                }
              />
            ))}
            <Button
              label={t('common.save')}
              busy={action.busy}
              disabled={replies.some((reply) => !reply.trim())}
              onPress={() =>
                void action.run(async () => {
                  await engine.saveCallQuickReplies(replies);
                  await q.refetch();
                  if (editOnly) onClose();
                  else setEditing(false);
                })
              }
            />
          </>
        ) : (
          <>
            {replies.map((reply, index) => (
              <Button
                key={index}
                variant="secondary"
                label={reply}
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    await onSend?.(reply);
                    onClose();
                  })
                }
              />
            ))}
            <Button
              variant="secondary"
              label={t('messenger.editReplies')}
              disabled={action.busy}
              onPress={() => setEditing(true)}
            />
          </>
        ))}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </ActionSheet>
  );
}
