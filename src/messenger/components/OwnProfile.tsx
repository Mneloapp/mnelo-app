import type { PropsWithChildren } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { Avatar } from '@/components/ui';
import { theme } from '@/theme/tokens';

export function ProfileGroup({
  children,
  title,
  flat = false,
}: PropsWithChildren<{ title?: string; flat?: boolean }>) {
  return (
    <View style={profileStyles.section}>
      {title ? (
        <AppText variant="caption" tone="secondary" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      <View style={[profileStyles.group, flat && profileStyles.flatGroup]}>{children}</View>
    </View>
  );
}

export function ProfileRow({
  label,
  value,
  icon,
  last = false,
  onPress,
}: {
  label: string;
  value?: string | undefined;
  icon?: IconName;
  last?: boolean;
  onPress: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.25;
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [profileStyles.row, pressed && profileStyles.pressed]}
    >
      {icon ? (
        <View style={profileStyles.rowIcon}>
          <AppIcon name={icon} size={20} />
        </View>
      ) : null}
      <View style={[profileStyles.rowContent, !last && profileStyles.divider]}>
        <View style={[profileStyles.rowText, stacked && profileStyles.stacked]}>
          <AppText style={profileStyles.label}>{label}</AppText>
          {value ? (
            <AppText
              tone="secondary"
              numberOfLines={stacked ? 3 : 2}
              style={[profileStyles.value, stacked && profileStyles.stackedValue]}
            >
              {value}
            </AppText>
          ) : null}
        </View>
        <AppIcon name="chevron-right" size={theme.icons.sm} color={theme.colors.textSecondary} />
      </View>
    </FocusPressable>
  );
}

export function ProfileHero({
  name,
  uri,
  username,
  phone,
  headline,
  label,
  onPress,
  children,
}: PropsWithChildren<{
  name: string;
  uri?: string | undefined;
  username?: string | undefined;
  phone?: string | undefined;
  headline?: string | undefined;
  label: string;
  onPress: () => void;
}>) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={profileStyles.hero}>
      <FocusPressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${name}`}
        accessibilityValue={phone ? { text: phone } : undefined}
        onPress={onPress}
        style={({ pressed }) => [
          profileStyles.identity,
          fontScale >= 1.4 && profileStyles.identityStack,
          pressed && profileStyles.pressed,
        ]}
      >
        <View style={profileStyles.heroAvatar}>
          <Avatar name={name} uri={uri} />
        </View>
        <View
          style={[profileStyles.identityText, fontScale >= 1.4 && profileStyles.identityStackText]}
        >
          <AppText variant="title" style={profileStyles.name}>
            {name}
          </AppText>
          {phone ? (
            <AppText variant="caption" tone="secondary" latin>
              {phone}
            </AppText>
          ) : null}
          {username ? (
            <AppText variant="caption" tone="secondary">
              @{username}
            </AppText>
          ) : null}
        </View>
      </FocusPressable>
      {headline ? (
        <AppText variant="caption" tone="secondary" style={profileStyles.headline}>
          {headline}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

export function ProfileAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [profileStyles.heroAction, pressed && profileStyles.pressed]}
    >
      <AppIcon name={icon} size={18} />
      <AppText variant="label" centered style={profileStyles.heroActionLabel}>
        {label}
      </AppText>
    </FocusPressable>
  );
}

export const profileStyles = StyleSheet.create({
  content: { gap: theme.spacing.xl, paddingHorizontal: theme.spacing.step },
  tabContent: { gap: theme.spacing.xl, paddingTop: theme.spacing.sm },
  hero: {
    gap: theme.spacing.lg,
    padding: theme.spacing.step,
    borderRadius: 26,
    backgroundColor: theme.colors.accentSoft,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  identityStack: { flexDirection: 'column', alignItems: 'stretch' },
  identityText: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  identityStackText: { flex: 0 },
  heroAvatar: {
    alignSelf: 'flex-start',
    padding: 6,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.background,
  },
  avatarRing: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accentSoft,
  },
  name: { fontSize: 25, lineHeight: 34, letterSpacing: -0.4 },
  headline: { lineHeight: 21 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  heroAction: {
    flex: 1,
    minWidth: 104,
    minHeight: theme.controls.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
  },
  heroActionLabel: { flexShrink: 1 },
  section: { gap: theme.spacing.sm },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  flatGroup: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  rowIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  rowText: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  label: { flexShrink: 1 },
  value: { flex: 1, minWidth: 0, textAlign: 'right' },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: theme.spacing.xs },
  stackedValue: { flex: 0, textAlign: 'left' },
  pressed: { opacity: theme.opacity.pressed },
  photo: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.md,
    borderRadius: 26,
    backgroundColor: theme.colors.accentSoft,
  },
  photoAction: {
    minHeight: theme.controls.minTapTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
  },
  photoActionText: { color: theme.colors.success },
});
