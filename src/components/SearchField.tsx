import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon } from './AppIcon';
import { IconButton, ui } from './ui';
import { useAppFont } from '@/theme/fonts';
import { theme } from '@/theme/tokens';
import { inputMinimumHeight, inputTextStyle } from './input-metrics';

export function SearchField({
  label,
  value,
  onChangeText,
  leading,
  onFocusChange,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  leading?: React.ReactNode;
  onFocusChange?: (focused: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const font = useAppFont();
  const { fontScale } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.search, focused && (Platform.OS === 'web' ? ui.focus : ui.inputFocus)]}>
      {leading ?? (
        <AppIcon name="search" size={theme.icons.sm} color={theme.colors.textSecondaryOnSoft} />
      )}
      <TextInput
        key={fontScale}
        accessibilityLabel={label}
        accessibilityLanguage={i18n.language}
        placeholder={label}
        placeholderTextColor={theme.colors.textSecondaryOnSoft}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocusChange?.(false);
        }}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={80}
        returnKeyType="search"
        selectionColor={theme.colors.black}
        style={[styles.input, font, { minHeight: inputMinimumHeight(fontScale) }]}
      />
      {value !== '' && (
        <IconButton icon="x" label={t('compose.clearSearch')} onPress={() => onChangeText('')} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radii.lg,
    borderWidth: theme.controls.borderWidth,
    borderColor: theme.colors.surfaceSoft,
  },
  input: { ...inputTextStyle, flex: 1, minWidth: 0 },
});
