import Feather from '@expo/vector-icons/Feather';
import { theme } from '@/theme/tokens';
import { useCallAppearance } from '@/theme/appearance';

export type IconName = keyof typeof Feather.glyphMap;
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
