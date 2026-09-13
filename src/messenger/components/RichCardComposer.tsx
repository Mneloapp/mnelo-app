import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '@/components/ActionSheet';
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
  return (
    <ActionSheet
      visible
      compact
      avoidKeyboard
      title={t(kind === 'poll' ? 'messenger.createPoll' : 'messenger.createEvent')}
      onClose={close}
    >
      <Field
        label={t(kind === 'poll' ? 'messenger.pollQuestion' : 'messenger.eventTitle')}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      {kind === 'poll' ? (
        <>
          {options.map((option, index) => (
            <View key={index} style={ui.row}>
              <View style={ui.flex}>
                <Field
                  label={t('messenger.pollOption', { number: index + 1 })}
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
                  label={t('messenger.removeOption', { number: index + 1 })}
                  onPress={() => setOptions((values) => values.filter((_, i) => i !== index))}
                />
              )}
            </View>
          ))}
          {options.length < 10 && (
            <Button
              variant="secondary"
              label={t('messenger.addOption')}
              onPress={() => setOptions((values) => [...values, ''])}
            />
          )}
          <View style={ui.row}>
            <AppText style={ui.flex}>{t('messenger.multipleAnswers')}</AppText>
            <Switch
              accessibilityLabel={t('messenger.multipleAnswers')}
              value={multiple}
              onValueChange={setMultiple}
              trackColor={{ true: theme.colors.accent }}
            />
          </View>
        </>
      ) : (
        <>
          <EventDateField
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
          <EventDateField
            label={t('messenger.eventEnd')}
            value={end}
            onChange={(date) => {
              setValidEnd(date !== null);
              if (date !== null) setEnd(date);
            }}
          />
          <Field
            label={t('messenger.eventLocation')}
            value={location}
            onChangeText={setLocation}
            maxLength={300}
          />
          <Field
            label={t('messenger.eventNotes')}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={2000}
          />
          <AppText variant="caption" tone="secondary">
            {t('messenger.eventCalendarHint')}
          </AppText>
        </>
      )}
      {error && <AppText accessibilityRole="alert">{error}</AppText>}
      <Button
        label={t('common.send')}
        variant="accent"
        disabled={!candidate.success || (kind === 'event' && (!validStart || !validEnd))}
        busy={busy}
        onPress={() => {
          if (candidate.success && (kind === 'poll' || (validStart && validEnd)))
            send(candidate.data);
        }}
      />
    </ActionSheet>
  );
}
