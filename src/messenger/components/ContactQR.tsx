import { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrGeometry } from '../qr-geometry';
import { theme } from '@/theme/tokens';

export function ContactQR({
  value,
  label,
  maxSize = theme.layout.qrSize,
}: {
  value: string;
  label: string;
  maxSize?: number;
}) {
  const { width } = useWindowDimensions();
  const geometry = useMemo(() => qrGeometry(value), [value]);
  const size = Math.min(maxSize, theme.layout.qrSize, width - theme.spacing.xl * 4);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ alignSelf: 'center' }}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${geometry.size} ${geometry.size}`}
        accessible={false}
      >
        <Rect width={geometry.size} height={geometry.size} fill={theme.colors.surface} />
        <Path d={geometry.path} fill={theme.colors.black} />
      </Svg>
    </View>
  );
}
