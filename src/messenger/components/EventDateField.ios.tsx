import { useTranslation } from 'react-i18next';
import { environment } from '@expo/ui/swift-ui/modifiers';
import { DatePicker, Host } from '@expo/ui/swift-ui';
export function EventDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (date: number | null) => void;
}) {
  const { i18n } = useTranslation();
  return (
    <Host matchContents colorScheme="light">
      <DatePicker
        modifiers={[
          environment({ key: 'locale', value: i18n.language.startsWith('ka') ? 'ka_GE' : 'en_GB' }),
        ]}
        title={label}
        selection={new Date(value)}
        displayedComponents={['date', 'hourAndMinute']}
        onDateChange={(date) => onChange(date.getTime())}
      />
    </Host>
  );
}
