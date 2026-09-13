import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { AppText } from '@/components/AppText';
import { Button, Field, IconButton, ui } from '@/components/ui';
import { EventDateField } from './EventDateField';
import { pollSchema, eventSchema, type RichCard } from '../rich-message';
import { theme } from '@/theme/tokens';
export function RichCardComposer({
  kind,
  close,
  send,
  busy,
  error,
}: {
  kind: 'poll' | 'event';
  close: () => void;
  send: (card: RichCard) => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(''),
    [options, setOptions] = useState(['', '']),
    [multiple, setMultiple] = useState(true);
  const [start, setStart] = useState(() => Math.ceil((Date.now() + 3600000) / 60000) * 60000),
    [end, setEnd] = useState(() => Math.ceil((Date.now() + 7200000) / 60000) * 60000);
  const [validStart, setValidStart] = useState(true),
    [validEnd, setValidEnd] = useState(true);
  const [location, setLocation] = useState(''),
    [notes, setNotes] = useState('');
  const candidate =
    kind === 'poll'
      ? pollSchema.safeParse({ version: 1, type: 'poll', question: title, options, multiple })
      : eventSchema.safeParse({ version: 1, type: 'event', title, start, end, location, notes });
  const submit = (
    <Button
      label={t(kind === 'poll' ? 'messenger.sendPoll' : 'messenger.sendEvent')}
      variant="accent"
      disabled={!candidate.success || (kind === 'event' && (!validStart || !validEnd))}
      busy={busy}
      onPress={() => {
        if (candidate.success && (kind === 'poll' || (validStart && validEnd)))
          send(candidate.data);
      }}
    />
  );
  return (
    <ActionSheet
      visible
      compact
      avoidKeyboard
      title={t(kind === 'poll' ? 'messenger.createPoll' : 'messenger.createEvent')}
      onClose={() => {
        if (!busy) close();
      }}
      footer={submit}
    >
      <View style={styles.intro}>
        <View style={styles.badge}>
          <AppIcon name={kind === 'poll' ? 'bar-chart-2' : 'calendar'} size={26} />
        </View>
        <AppText variant="caption" tone="secondary" style={ui.flex}>
          {t(kind === 'poll' ? 'messenger.pollHint' : 'messenger.eventHint')}
        </AppText>
      </View>
      <View style={styles.card}>
        <Field
          label={t(kind === 'poll' ? 'messenger.pollQuestion' : 'messenger.eventTitle')}
          placeholder={t(
            kind === 'poll' ? 'messenger.pollPlaceholder' : 'messenger.eventPlaceholder',
          )}
          style={styles.input}
          editable={!busy}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
      </View>
      {kind === 'poll' ? (
        <>
          <View style={styles.card}>
            <View style={styles.sectionHeading}>
              <AppText variant="label" tone="secondary">
                {t('messenger.pollOptions')}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {options.length}/10
              </AppText>
            </View>
            {options.map((option, index) => (
              <View key={index} style={styles.optionRow}>
                <View style={styles.optionNumber}>
                  <AppText variant="caption" tone="secondary">
                    {index + 1}
                  </AppText>
                </View>
                <View style={ui.flex}>
                  <Field
                    label={t('messenger.pollOption', { number: index + 1 })}
                    hideLabel
                    placeholder={t('messenger.pollOption', { number: index + 1 })}
                    style={styles.optionInput}
                    editable={!busy}
                    value={option}
                    maxLength={120}
                    onChangeText={(text) =>
                      setOptions((values) => values.map((value, i) => (i === index ? text : value)))
                    }
                  />
                </View>
                {options.length > 2 && (
                  <IconButton
                    icon="x"
                    disabled={busy}
                    label={t('messenger.removeOption', { number: index + 1 })}
                    onPress={() => setOptions((values) => values.filter((_, i) => i !== index))}
                  />
                )}
              </View>
            ))}
            {options.length < 10 && (
              <FocusPressable
                accessibilityRole="button"
                accessibilityLabel={t('messenger.addOption')}
                disabled={busy}
                style={styles.addOption}
                onPress={() => setOptions((values) => [...values, ''])}
              >
                <View style={styles.addIcon}>
                  <AppIcon name="plus" size={18} />
                </View>
                <AppText variant="bodyMedium">{t('messenger.addOption')}</AppText>
              </FocusPressable>
            )}
          </View>
          <View style={[styles.card, styles.toggleRow]}>
            <View style={ui.flex}>
              <AppText variant="bodyMedium">{t('messenger.multipleAnswers')}</AppText>
              <AppText variant="caption" tone="secondary">
                {t('messenger.multipleAnswersHint')}
              </AppText>
            </View>
            <Switch
              accessibilityLabel={t('messenger.multipleAnswers')}
              disabled={busy}
              value={multiple}
              onValueChange={setMultiple}
              trackColor={{ true: theme.colors.accent }}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.card}>
            <EventDateField
              disabled={busy}
              label={t('messenger.eventStart')}
              value={start}
              onChange={(date) => {
                setValidStart(date !== null);
                if (date === null) return;
                setStart(date);
                if (date >= end) {
                  setEnd(date + 3600000);
                  setValidEnd(true);
                }
              }}
            />
            <View style={styles.divider} />
            <EventDateField
              disabled={busy}
              label={t('messenger.eventEnd')}
              value={end}
              onChange={(date) => {
                setValidEnd(date !== null);
                if (date !== null) setEnd(date);
              }}
            />
          </View>
          <View style={styles.card}>
            <Field
              style={styles.input}
              editable={!busy}
              placeholder={t('messenger.eventLocationPlaceholder')}
              label={t('messenger.eventLocation')}
              value={location}
              onChangeText={setLocation}
              maxLength={300}
            />
          </View>
          <View style={styles.card}>
            <Field
              style={[styles.input, styles.notes]}
              editable={!busy}
              placeholder={t('messenger.eventNotesPlaceholder')}
              label={t('messenger.eventNotes')}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={2000}
            />
          </View>
          <AppText variant="caption" tone="secondary">
            {t('messenger.eventCalendarHint')}
          </AppText>
        </>
      )}
      {error && <AppText accessibilityRole="alert">{error}</AppText>}
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  card: { padding: 16, gap: 12, borderRadius: 20, backgroundColor: theme.colors.surface },
  input: { borderWidth: 0, backgroundColor: theme.colors.surfaceSoft, borderRadius: 12 },
  notes: { minHeight: 88, maxHeight: 144 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionNumber: { width: 24, alignItems: 'center' },
  optionInput: {
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    borderColor: theme.colors.border,
    paddingHorizontal: 4,
  },
  addOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  addIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
});
