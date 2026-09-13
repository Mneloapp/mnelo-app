import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { Button, ui } from '@/components/ui';
import { FocusPressable } from '@/components/FocusPressable';
import { formatDate, formatTime } from '@/i18n/format';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import { useLocalAction } from '../screens/shared';
import { addEventToCalendar } from '../event-calendar';
import { googleEventURL, pollResults, type RichCard } from '../rich-message';
export function RichMessageCard({ id, card }: { id: string; card: RichCard }) {
  const { t } = useTranslation();
  const { engine, identity } = useDevice();
  const action = useLocalAction();
  const [calendar, setCalendar] = useState(false);
  const votes = useQuery({
    queryKey: ['device', 'reactions', id],
    queryFn: () => engine.reactions(id),
    enabled: card.type === 'poll',
    networkMode: 'always',
  });
  if (card.type === 'poll') {
    const result = pollResults(card, votes.data ?? []),
      mine = result.choices.get(identity?.key ?? '');
    return (
      <View style={styles.card} testID="poll-card">
        <AppText variant="headline">{card.question}</AppText>
        <AppText variant="caption" tone="secondary">
          {t(card.multiple ? 'messenger.chooseMany' : 'messenger.chooseOne')}
        </AppText>
        {card.options.map((option, index) => (
          <FocusPressable
            key={index}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: mine?.has(index) ?? false, disabled: action.busy }}
            disabled={action.busy}
            accessibilityLabel={t('messenger.pollChoice', {
              option,
              count: result.counts[index] ?? 0,
            })}
            onPress={() => void action.run(() => engine.vote(id, index))}
            style={styles.option}
          >
            <AppIcon name={mine?.has(index) ? 'check-circle' : 'circle'} size={20} />
            <View style={ui.flex}>
              <AppText>{option}</AppText>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${result.voters ? (100 * (result.counts[index] ?? 0)) / result.voters : 0}%`,
                    },
                  ]}
                />
              </View>
            </View>
            <AppText variant="caption">{result.counts[index] ?? 0}</AppText>
          </FocusPressable>
        ))}
        <AppText variant="caption" tone="secondary">
          {t('messenger.pollVoters', { count: result.voters })}
        </AppText>
        {(action.error || votes.isError) && (
          <AppText accessibilityRole="alert">{action.error ?? t('messenger.genericError')}</AppText>
        )}
      </View>
    );
  }
  return (
    <View style={styles.card} testID="event-card">
      <View style={ui.row}>
        <AppIcon name="calendar" />
        <AppText variant="headline" style={ui.flex}>
          {card.title}
        </AppText>
      </View>
      <AppText>
        {formatDate(new Date(card.start).toISOString())} ·{' '}
        {formatTime(new Date(card.start).toISOString())}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {t('messenger.eventEnd')}: {formatDate(new Date(card.end).toISOString())} ·{' '}
        {formatTime(new Date(card.end).toISOString())}
      </AppText>
      {Boolean(card.location) && <AppText>{card.location}</AppText>}
      {Boolean(card.notes) && <AppText>{card.notes}</AppText>}
      <Button
        variant="secondary"
        label={t('messenger.addToCalendar')}
        onPress={() => setCalendar((value) => !value)}
      />
      {calendar && (
        <>
          <Button
            variant="secondary"
            label={t('messenger.phoneCalendar')}
            busy={action.busy}
            onPress={() => void action.run(() => addEventToCalendar(card))}
          />
          <Button
            variant="secondary"
            label={t('messenger.googleCalendar')}
            busy={action.busy}
            onPress={() => void action.run(() => Linking.openURL(googleEventURL(card)))}
          />
        </>
      )}
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { gap: 12, minWidth: 210 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
  },
  track: { height: 4, backgroundColor: theme.colors.border, borderRadius: 4, marginTop: 6 },
  bar: { height: 4, backgroundColor: theme.colors.accent, borderRadius: 4 },
});
