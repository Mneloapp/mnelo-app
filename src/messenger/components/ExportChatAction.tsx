import { useLayoutEffect, useRef } from 'react';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { SheetAction } from '@/components/SheetAction';
import { useDevice } from '../DeviceProvider';
import { exportChat } from '../export-chat';
import { useLocalAction } from '../screens/shared';
import { InfoGroup } from './ContactInfo';

export function ExportChatAction({ chatId }: { chatId: string }) {
  const { engine, view } = useDevice();
  const { t } = useTranslation();
  const action = useLocalAction();
  const focused = useIsFocused();
  const current = useRef<object | null>(null);
  useLayoutEffect(() => {
    current.current = focused ? {} : null;
    return () => {
      current.current = null;
    };
  }, [engine, view, chatId, focused]);
  return (
    <InfoGroup>
      <SheetAction
        icon="share"
        label={t(action.busy ? 'messenger.exportPreparing' : 'messenger.exportChat')}
        disabled={action.busy || !focused}
        onPress={() =>
          void action.run(async () => {
            const scope = current.current;
            if (!scope) return;
            await exportChat(engine, view, chatId, {
              isCurrent: () => current.current === scope,
            });
          })
        }
      />
      <AppText variant="caption" tone="secondary" accessibilityLiveRegion="polite">
        {t('messenger.exportLocalHint')}
      </AppText>
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </InfoGroup>
  );
}
