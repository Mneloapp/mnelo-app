import { memo } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { Avatar, Row, ui } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import { safeWebsite, type LocalProfile } from '../local-profile';
import { avatarUri } from '../profile-avatar';
import { useLocalAction } from '../screens/shared';

export const PeerAvatar = memo(function PeerAvatar({ peer, name }: { peer: string; name: string }) {
  const { engine } = useDevice();
  const query = useQuery({
    queryKey: ['device', 'contact-profile', peer],
    queryFn: () => engine.contactProfile(peer),
    networkMode: 'always',
    staleTime: Infinity,
  });
  return <Avatar name={name} uri={avatarUri(query.data?.avatar ?? '')} />;
});
export function ContactCard({
  name,
  profile,
  children,
}: {
  name: string;
  profile: LocalProfile;
  children?: React.ReactNode;
}) {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.identity}>
        <Avatar name={name} uri={avatarUri(profile.avatar)} size="large" />
        <View style={ui.flex}>
          <AppText variant="title" accessibilityRole="header">
            {name}
          </AppText>
          {profile.username ? <AppText tone="secondary">@{profile.username}</AppText> : null}
          {profile.headline ? (
            <AppText variant="label" style={cardStyles.headline}>
              {profile.headline}
            </AppText>
          ) : null}
        </View>
      </View>
      {profile.about ? <AppText tone="secondary">{profile.about}</AppText> : null}
      {children}
    </View>
  );
}
export function CardDetails({ profile }: { profile: LocalProfile }) {
  const { t } = useTranslation();
  const action = useLocalAction();
  const website = safeWebsite(profile.website);
  return (
    <View>
      {profile.email ? (
        <Row
          title={profile.email}
          subtitle={t('card.email')}
          left={<AppIcon name="mail" />}
          accessibilityLabel={t('card.sendEmail') + ': ' + profile.email}
          onPress={() =>
            void action.run(() => Linking.openURL('mailto:' + encodeURIComponent(profile.email)))
          }
        />
      ) : null}
      {website ? (
        <Row
          title={profile.website}
          subtitle={t('card.website')}
          left={<AppIcon name="globe" />}
          right={<AppIcon name="arrow-up-right" />}
          accessibilityLabel={t('card.openWebsite') + ': ' + profile.website}
          onPress={() => void action.run(() => Linking.openURL(website))}
        />
      ) : null}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
export const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.xl,
    borderWidth: theme.controls.borderWidth,
    borderColor: theme.colors.border,
  },
  identity: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.lg },
  headline: { marginTop: theme.spacing.sm },
  settings: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingHorizontal: theme.spacing.lg,
  },
});
