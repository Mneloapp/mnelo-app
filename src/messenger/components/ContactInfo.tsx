import type { PropsWithChildren } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { SheetAction } from '@/components/SheetAction';
import { Avatar } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { profileStyles } from './OwnProfile';

export function ContactHero({
  name,
  uri,
  subtitle,
  about,
}: {
  name: string;
  uri?: string | undefined;
  subtitle?: string | undefined;
  about?: string | undefined;
}) {
  return (
    <View style={infoStyles.hero}>
      {about ? (
        <View style={profileStyles.status}>
          <AppText variant="label" centered numberOfLines={3}>
            {about}
          </AppText>
          <View style={profileStyles.statusTip} />
        </View>
      ) : null}
      <View style={profileStyles.avatarRing}>
        <Avatar name={name} uri={uri} size="profile" />
      </View>
      <AppText variant="title" centered style={infoStyles.name}>
        {name}
      </AppText>
      {subtitle ? (
        <AppText centered tone="secondary" selectable>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

export function InfoGroup({ children }: PropsWithChildren) {
  return <View style={infoStyles.group}>{children}</View>;
}

export function ContactAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        infoStyles.tile,
        disabled && infoStyles.disabled,
        pressed && infoStyles.pressed,
      ]}
    >
      <AppIcon name={icon} color={theme.colors.success} />
      <AppText variant="label" centered>
        {label}
      </AppText>
    </FocusPressable>
  );
}

export function ChatPrivacyActions({
  busy,
  blocked = false,
  onClear,
  onBlock,
}: {
  busy: boolean;
  blocked?: boolean;
  onClear: () => void;
  onBlock?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <InfoGroup>
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
          label={t(blocked ? 'moderation.unblock' : 'messenger.blockContact')}
          danger={!blocked}
          disabled={busy}
          onPress={() =>
            blocked
              ? onBlock()
              : Alert.alert(t('messenger.blockContact'), t('card.blockHint'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('messenger.blockContact'), style: 'destructive', onPress: onBlock },
                ])
          }
        />
      )}
    </InfoGroup>
  );
}

export const infoStyles = StyleSheet.create({
  hero: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.lg },
  name: { fontSize: 26, lineHeight: 34, marginTop: theme.spacing.sm },
  about: { marginTop: theme.spacing.sm },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  tile: {
    flex: 1,
    minWidth: 88,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.65 },
  field: {
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radii.md,
  },
});
