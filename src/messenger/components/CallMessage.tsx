import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { ActionSheet } from '@/components/ActionSheet';
import { SheetAction } from '@/components/SheetAction';
import { formatTime } from '@/i18n/format';
import { theme } from '@/theme/tokens';
import type { LocalMessage } from '../model';
import { callOutcomeCopy, readCallRecord } from '../call-record';

export function CallMessage({
  message,
  onPress,
  onLongPress,
}: {
  message: LocalMessage;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const call = readCallRecord(message.body);
  const outgoing = call.direction === 'outgoing';
  const missed = call.status === 'missed';
  const title = t(
    missed
      ? call.media === 'video'
        ? 'messenger.callMissedVideo'
        : 'messenger.callMissedVoice'
      : call.media === 'video'
        ? 'messenger.callVideo'
        : 'messenger.callVoice',
  );
  const detail = t(missed ? 'messenger.callBackHint' : callOutcomeCopy[call.status]);
  const direction =
    call.direction === 'unknown'
      ? ''
      : t(outgoing ? 'messenger.callDirectionOutgoing' : 'messenger.callDirectionIncoming');
  const time = formatTime(new Date(message.sentAt).toISOString());
  return (
    <FocusPressable
      testID="call-message"
      accessibilityRole="button"
      accessibilityLabel={[title, direction, detail, time].filter(Boolean).join('. ')}
      accessibilityHint={t('messenger.callOptionsHint')}
      onPress={onPress}
      onLongPress={onLongPress ?? onPress}
      style={[
        styles.card,
        outgoing && styles.outgoing,
        call.direction === 'unknown' && styles.unknown,
      ]}
    >
      <View style={styles.icon}>
        <AppIcon
          name={
            call.media === 'video'
              ? 'video'
              : outgoing
                ? 'phone-outgoing'
                : call.direction === 'incoming'
                  ? 'phone-incoming'
                  : 'phone'
          }
          color={missed ? theme.colors.error : theme.colors.textPrimary}
        />
        {call.media === 'video' && call.direction !== 'unknown' && (
          <View style={styles.videoDirection}>
            <AppIcon
              name={outgoing ? 'arrow-up-right' : 'arrow-down-left'}
              size={theme.icons.sm}
              color={missed ? theme.colors.error : theme.colors.textPrimary}
            />
          </View>
        )}
      </View>
      <View style={styles.content}>
        <AppText variant="bodyMedium" style={missed && styles.missed}>
          {title}
        </AppText>
        <View style={styles.detail}>
          <AppText variant="caption" tone="secondary" style={styles.description}>
            {detail}
          </AppText>
          <AppText variant="caption" tone="secondary" style={styles.time}>
            {time}
          </AppText>
        </View>
      </View>
    </FocusPressable>
  );
}

export function CallBackSheet({
  message,
  name,
  available,
  onClose,
  onCall,
}: {
  message: LocalMessage;
  name: string;
  available: boolean;
  onClose: () => void;
  onCall: (media: 'voice' | 'video') => void;
}) {
  const { t } = useTranslation();
  const call = readCallRecord(message.body);
  return (
    <ActionSheet visible compact title={name} onClose={onClose}>
      <View style={styles.callAction}>
        <SheetAction
          icon={call.media === 'video' ? 'video' : 'phone'}
          label={t(call.media === 'video' ? 'messenger.callVideo' : 'messenger.callBack')}
          disabled={!available}
          onPress={() => {
            onClose();
            onCall(call.media);
          }}
        />
      </View>
      {!available && (
        <AppText variant="caption" tone="secondary">
          {t('messenger.callUnavailable')}
        </AppText>
      )}
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    width: 304,
    maxWidth: '88%',
    marginVertical: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.controls.minTapTarget,
  },
  outgoing: { alignSelf: 'flex-end', backgroundColor: theme.colors.messageOutgoing },
  unknown: { alignSelf: 'center' },
  icon: {
    width: theme.spacing.section,
    height: theme.spacing.section,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDirection: {
    position: 'absolute',
    right: -theme.spacing.xs,
    bottom: -theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
  },
  content: { flex: 1, minWidth: 0 },
  detail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: theme.spacing.sm,
  },
  description: { flexGrow: 1, flexShrink: 1 },
  time: { marginLeft: 'auto', textAlign: 'right' },
  missed: { color: theme.colors.error },
  callAction: {
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
  },
});
