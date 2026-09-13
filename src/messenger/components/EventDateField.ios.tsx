import { useTranslation } from 'react-i18next';
import { environment, labelsHidden, disabled as disable } from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { DatePicker, Host } from '@expo/ui/swift-ui';
export function EventDateField({
  label,
  disabled = false,
  value,
  onChange,
}: {
  label: string;
  disabled?: boolean;
  value: number;
  onChange: (date: number | null) => void;
}) {
  const { i18n } = useTranslation();
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
      <Host matchContents colorScheme="light">
        <DatePicker
          modifiers={[
            environment({
              key: 'locale',
              value: i18n.language.startsWith('ka') ? 'ka_GE' : 'en_GB',
            }),
            labelsHidden(),
            disable(disabled),
          ]}
          title={label}
          selection={new Date(value)}
          displayedComponents={['date', 'hourAndMinute']}
          onDateChange={(date) => onChange(date.getTime())}
        />
      </Host>
    </View>
  );
}
