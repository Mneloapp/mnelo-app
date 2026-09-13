import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Field } from '@/components/ui';
const display = (value: number) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
export function EventDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (date: number | null) => void;
}) {
  const { t } = useTranslation();
  const [edit, setEdit] = useState(() => ({ source: value, text: display(value) }));
  const draft = edit.source === value ? edit.text : display(value);
  const setDraft = (text: string) => setEdit({ source: value, text });
  return (
    <Field
      label={label}
      value={draft}
      placeholder={t('messenger.eventDatePlaceholder')}
      onChangeText={(text) => {
        setDraft(text);
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) {
          onChange(null);
          return;
        }
        const date = new Date(text.replace(' ', 'T') + ':00');
        if (Number.isFinite(date.getTime()) && display(date.getTime()) === text)
          onChange(date.getTime());
        else onChange(null);
      }}
    />
  );
}
