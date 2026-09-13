import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from './AppText';
import { CountryPicker } from './CountryPicker';
import { ui } from './ui';
import { inputMinimumHeight, inputTextStyle } from './input-metrics';
import { useAppFont } from '@/theme/fonts';
import { theme } from '@/theme/tokens';
import { updatePhoneEntry, type PhoneEntry } from '@/messenger/phone-entry';

export function PhoneNumberField({
  value,
  onChange,
  disabled = false,
  minimal = false,
  dialpad = false,
  showSoftInputOnFocus = true,
}: {
  value: PhoneEntry;
  onChange: (value: PhoneEntry) => void;
  disabled?: boolean;
  minimal?: boolean;
  dialpad?: boolean;
  showSoftInputOnFocus?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const font = useAppFont();
  const { fontScale } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {!minimal && <AppText variant="label">{t('phone.nationalInput')}</AppText>}
      <View
        style={[
          styles.control,
          dialpad && styles.dialpad,
          focused && (Platform.OS === 'web' ? ui.focus : ui.inputFocus),
        ]}
      >
        <CountryPicker
          inline
          value={value.country}
          onChange={(country) => onChange({ ...value, country })}
          disabled={disabled}
        />
        <View style={styles.divider} />
        <TextInput
          key={fontScale}
          accessibilityLabel={t('phone.nationalInput')}
          accessibilityLanguage={i18n.language}
          placeholder={minimal ? t('phone.nationalInput') : undefined}
          placeholderTextColor={theme.colors.textSecondary}
          value={value.number}
          onChangeText={(text) => onChange(updatePhoneEntry(value, text))}
          editable={!disabled}
          keyboardType="phone-pad"
          showSoftInputOnFocus={showSoftInputOnFocus}
          textContentType="telephoneNumber"
          autoComplete="tel-national"
          maxLength={30}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectionColor={theme.colors.black}
          style={[styles.input, font, { minHeight: inputMinimumHeight(fontScale) }]}
        />
      </View>
      {!minimal && (
        <AppText variant="caption" tone="secondary">
          {t('phone.nationalHint')}
        </AppText>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: theme.spacing.sm },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.controls.borderWidth,
    borderColor: theme.colors.controlBorder,
    borderRadius: theme.radii.md,
  },
  dialpad: { borderWidth: 0, backgroundColor: 'transparent' },
  divider: {
    width: theme.controls.borderWidth,
    alignSelf: 'stretch',
    marginVertical: theme.spacing.md,
    backgroundColor: theme.colors.border,
  },
  input: { ...inputTextStyle, flex: 1, minWidth: 0 },
});
