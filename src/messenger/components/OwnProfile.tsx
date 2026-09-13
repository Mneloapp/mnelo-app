import type { PropsWithChildren } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { Avatar } from '@/components/ui';
import { theme } from '@/theme/tokens';

export function ProfileGroup({ children }: PropsWithChildren) {
  return <View style={profileStyles.group}>{children}</View>;
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
      {icon ? <AppIcon name={icon} /> : null}
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
  headline,
  label,
  onPress,
}: {
  name: string;
  uri?: string | undefined;
  username?: string | undefined;
  headline?: string | undefined;
  label: string;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}`}
      onPress={onPress}
      style={({ pressed }) => [profileStyles.hero, pressed && profileStyles.pressed]}
    >
      {headline ? (
        <View style={profileStyles.status}>
          <AppText variant="label" centered numberOfLines={3}>
            {headline}
          </AppText>
          <View style={profileStyles.statusTip} />
        </View>
      ) : null}
      <View style={profileStyles.avatarRing}>
        <Avatar name={name} uri={uri} size="profile" />
      </View>
      <AppText variant="title" centered style={profileStyles.name}>
        {name}
      </AppText>
      {username ? (
        <AppText centered tone="secondary">
          @{username}
        </AppText>
      ) : null}
    </FocusPressable>
  );
}

export const profileStyles = StyleSheet.create({
  content: { gap: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  hero: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  avatarRing: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accentSoft,
  },
  name: { marginTop: theme.spacing.md },
  status: {
    maxWidth: '85%',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    marginBottom: theme.spacing.xs,
  },
  statusTip: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    width: 10,
    height: 10,
    transform: [{ rotate: '45deg' }],
    backgroundColor: theme.colors.surface,
  },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
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
  photo: { alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.md },
  photoAction: {
    minHeight: theme.controls.minTapTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  photoActionText: { color: theme.colors.success },
  headerActions: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.pill,
  },
});
