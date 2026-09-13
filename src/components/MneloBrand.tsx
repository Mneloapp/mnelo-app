import { Image, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
import brandExports from '../../assets/brand/exports.json';

const marks = {
  primary: require('../../assets/brand/mark-primary.png'),
  dark: require('../../assets/brand/mark-dark.png'),
  black: require('../../assets/brand/mark-black.png'),
  white: require('../../assets/brand/mark-white.png'),
};
const logos = {
  primary: require('../../assets/brand/wordmark-primary.png'),
  dark: require('../../assets/brand/wordmark-dark.png'),
  black: require('../../assets/brand/wordmark-black.png'),
  white: require('../../assets/brand/wordmark-white.png'),
};
type Variant = keyof typeof marks;

// Small optimized exports of canonical SVG paths; no native rendering dependency or font race.
export function MneloMark({
  size = theme.brand.markSize,
  variant = 'primary',
}: {
  size?: number;
  variant?: Variant;
}) {
  return (
    <Image
      source={marks[variant]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

export function MneloLogo({
  size = 'header',
  variant = 'primary',
}: {
  size?: keyof typeof theme.brand.wordmark;
  variant?: Variant;
}) {
  const { t } = useTranslation();
  const { fontScale, width } = useWindowDimensions();
  const ratio = brandExports['wordmark-primary'].width / brandExports['wordmark-primary'].height;
  const desiredHeight = theme.brand.wordmark[size] * Math.min(fontScale, 1.6);
  const height = Math.min(desiredHeight, (width - theme.spacing.xl * 2) / ratio);
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={t('brand')} style={styles.logo}>
      <Image
        source={logos[variant]}
        style={{ width: height * ratio, height, maxWidth: '100%' }}
        resizeMode="contain"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </View>
  );
}
const styles = StyleSheet.create({ logo: { flexShrink: 1, alignItems: 'flex-start' } });
