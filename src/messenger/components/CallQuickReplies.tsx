import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Field, StateView } from '@/components/ui';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { ScreenAppearance } from '@/theme/appearance';
import { theme } from '@/theme/tokens';
import { SettingsAction, settingsStyles } from './SettingsUI';
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
  const { fontScale } = useWindowDimensions();
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
  const save = () =>
    void action.run(async () => {
      await engine.saveCallQuickReplies(replies);
      await q.refetch();
      if (editOnly) onClose();
      else setEditing(false);
    });
  return (
    <ScreenAppearance.Provider value="light">
      <ActionSheet
        visible
        title={t('messenger.callQuickReplies')}
        onClose={() => {
          if (!action.busy) onClose();
        }}
        avoidKeyboard
        compact
        footer={
          !q.isPending && !q.isError ? (
            <SettingsAction
              icon={editing ? 'check' : 'edit-2'}
              label={t(editing ? 'common.save' : 'messenger.editReplies')}
              variant={editing ? 'accent' : 'secondary'}
              busy={action.busy}
              disabled={editing && replies.some((reply) => !reply.trim())}
              onPress={editing ? save : () => setEditing(true)}
            />
          ) : undefined
        }
      >
        <AppText variant="caption" tone="secondary" centered style={settingsStyles.note}>
          {t(editing ? 'messenger.callQuickRepliesEditHint' : 'messenger.callQuickRepliesHint')}
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
                  style={[
                    settingsStyles.field,
                    { minHeight: Math.max(84, 56 * fontScale), maxHeight: 200 },
                  ]}
                  scrollEnabled
                  maxLength={240}
                  editable={!action.busy}
                  onChangeText={(text) =>
                    setDraft(replies.map((value, position) => (position === index ? text : value)))
                  }
                />
              ))}
            </>
          ) : (
            <>
              {replies.map((reply, index) => (
                <FocusPressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={reply}
                  accessibilityState={{ disabled: action.busy }}
                  disabled={action.busy}
                  style={({ pressed }) => [
                    styles.reply,
                    pressed && settingsStyles.pressed,
                    action.busy && settingsStyles.disabled,
                  ]}
                  onPress={() =>
                    void action.run(async () => {
                      await onSend?.(reply);
                      onClose();
                    })
                  }
                >
                  <View style={settingsStyles.badge}>
                    <AppIcon name={replyIcons[index]!} color={theme.colors.success} />
                  </View>
                  <AppText style={styles.replyText}>{reply}</AppText>
                  <AppIcon name="send" size={18} color={theme.colors.success} />
                </FocusPressable>
              ))}
            </>
          ))}
        {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      </ActionSheet>
    </ScreenAppearance.Provider>
  );
}

const replyIcons: IconName[] = ['briefcase', 'message-circle', 'clock'];
const styles = StyleSheet.create({
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    minHeight: 84,
  },
  replyText: { flex: 1, minWidth: 0 },
});
