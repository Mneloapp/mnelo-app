import { StyleSheet, Text, useWindowDimensions, type TextProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
import { useAppFont } from '@/theme/fonts';
import { useCallAppearance } from '@/theme/appearance';

type Props = TextProps & {
  variant?: keyof typeof theme.typography;
  tone?: 'primary' | 'secondary' | 'accent';
  centered?: boolean;
  latin?: boolean;
};

export function AppText({
  variant = 'body',
  tone = 'primary',
  centered = false,
  latin = false,
  style,
  ...props
}: Props) {
  const { i18n } = useTranslation();
  // Recreate native measurement when Dynamic Type, the loaded face or its scale cap changes.
  // iOS 26.5 / RN 0.86.3 can otherwise retain an earlier line box.
  const { fontScale } = useWindowDimensions();
  const font = useAppFont(theme.typography[variant].fontWeight, latin);
  const dark = useCallAppearance();
  return (
    <Text
      key={`${fontScale}:${font?.fontFamily ?? 'system'}:${props.maxFontSizeMultiplier ?? 0}`}
      accessibilityLanguage={i18n.language}
      {...props}
      style={[
        theme.typography[variant],
        font,
        styles[tone],
        dark && {
          color: tone === 'secondary' ? theme.colors.callSecondary : theme.colors.callText,
        },
        centered && styles.centered,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  primary: { color: theme.colors.textPrimary },
  secondary: { color: theme.colors.textSecondaryOnSoft },
  accent: { color: theme.colors.accentText },
  centered: { textAlign: 'center' },
});
