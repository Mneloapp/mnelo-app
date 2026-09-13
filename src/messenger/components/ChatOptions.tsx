import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { SheetAction } from '@/components/SheetAction';

export function ChatOptions({
  visible,
  busy,
  close,
  onContact,
  onGroup,
  onClear,
  onBlock,
}: {
  visible: boolean;
  busy: boolean;
  close: () => void;
  onContact?: (() => void) | undefined;
  onGroup?: (() => void) | undefined;
  onClear: () => void;
  onBlock?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <ActionSheet visible={visible} title={t('messenger.chatOptions')} onClose={close}>
      {onContact && (
        <SheetAction icon="user" label={t('card.view')} onPress={onContact} disabled={busy} />
      )}
      {onGroup && (
        <SheetAction
          icon="users"
          label={t('messenger.groupDetails')}
          onPress={onGroup}
          disabled={busy}
        />
      )}
      <SheetAction
        icon="trash-2"
        label={t('messenger.clearHistory')}
        danger
        disabled={busy}
        onPress={() =>
          Alert.alert(t('messenger.clearHistory'), t('messenger.deletionHint'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('messenger.confirmClear'), style: 'destructive', onPress: onClear },
          ])
        }
      />
      {onBlock && (
        <SheetAction
          icon="slash"
          label={t('messenger.blockContact')}
          disabled={busy}
          onPress={onBlock}
        />
      )}
      <SheetAction icon="x" label={t('common.cancel')} onPress={close} />
    </ActionSheet>
  );
}
