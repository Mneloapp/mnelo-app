import type { PropsWithChildren } from 'react';
import { Alert, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { SheetAction } from '@/components/SheetAction';
import { Avatar } from '@/components/ui';
import { theme } from '@/theme/tokens';

export function ContactHero({
  name,
  uri,
  subtitle,
  about,
  group = false,
  fallbackRingColor,
}: {
  name: string;
  uri?: string | undefined;
  subtitle?: string | undefined;
  about?: string | undefined;
  group?: boolean;
  fallbackRingColor?: string | undefined;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.4;
  return (
    <View style={infoStyles.hero}>
      <View style={[infoStyles.identity, stacked && infoStyles.identityStack]}>
        <View style={infoStyles.avatarRing}>
          <Avatar
            name={name}
            uri={uri}
            group={group}
            fallbackRingColor={fallbackRingColor}
            size="large"
          />
        </View>
        <View style={[infoStyles.identityText, stacked && infoStyles.identityStackText]}>
          <AppText variant="title" style={infoStyles.name}>
            {name}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" tone="secondary" selectable>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {about ? (
        <AppText variant="caption" tone="secondary" style={infoStyles.about}>
          {about}
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
  hero: {
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 26,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  identityStack: { flexDirection: 'column', alignItems: 'stretch' },
  identityText: { flex: 1, minWidth: 0, gap: theme.spacing.sm },
  identityStackText: { flex: 0 },
  avatarRing: {
    alignSelf: 'flex-start',
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.pill,
  },
  name: { fontSize: 23, lineHeight: 31, letterSpacing: -0.4 },
  about: { lineHeight: 21 },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  tile: {
    flex: 1,
    minWidth: 88,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: 16,
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
