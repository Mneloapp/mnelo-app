import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { FocusPressable } from '@/components/FocusPressable';
import { theme } from '@/theme/tokens';
import type { LocalCall } from '../model';
import { PeerAvatar } from './ContactCard';

export function recentCallPeers(calls: readonly LocalCall[]) {
  const seen = new Set<string>();
  const recent: LocalCall[] = [];
  for (const call of calls) {
    if (call.group || seen.has(call.peer)) continue;
    seen.add(call.peer);
    recent.push(call);
    if (recent.length === 4) break;
  }
  return recent;
}

export function RecentCalls({
  calls,
  onCall,
}: {
  calls: readonly LocalCall[];
  onCall: (call: LocalCall) => void;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const peers = recentCallPeers(calls);
  if (peers.length < 2) return null;
  return (
    <View style={styles.section}>
      <AppText variant="label" tone="secondary" accessibilityRole="header">
        {t('focus.recentCalls')}
      </AppText>
      <View style={styles.tiles}>
        {peers.map((call) => (
          <FocusPressable
            key={call.peer}
            style={[styles.tile, fontScale > 1.3 && styles.largeTile]}
            accessibilityRole="button"
            accessibilityLabel={t('compose.voice', { name: call.name })}
            onPress={() => onCall(call)}
          >
            <PeerAvatar peer={call.peer} name={call.name} colorfulFallback />
            <AppText variant="caption" numberOfLines={fontScale > 1.3 ? undefined : 2} centered>
              {call.name}
            </AppText>
          </FocusPressable>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { marginVertical: theme.spacing.md, gap: theme.spacing.md },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  tile: {
    flex: 1,
    minWidth: 0,
    flexBasis: '20%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  largeTile: { flexBasis: '40%' },
});
