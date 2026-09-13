import Feather from '@expo/vector-icons/Feather';
import { View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '@/theme/tokens';
import { useCallAppearance } from '@/theme/appearance';

export type IconName = keyof typeof Feather.glyphMap | 'keyboard' | 'stop';
export function AppIcon({
  name,
  size = theme.icons.md,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const dark = useCallAppearance();
  if (name === 'stop')
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: 3,
            backgroundColor: color ?? theme.colors.error,
          }}
        />
      </View>
    );
  if (name === 'keyboard')
    return (
      <MaterialCommunityIcons
        name="keyboard-outline"
        size={size}
        color={color ?? (dark ? theme.colors.callText : theme.colors.black)}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  return (
    <Feather
      name={name}
      size={size}
      color={color ?? (dark ? theme.colors.callText : theme.colors.black)}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
