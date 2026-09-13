import type { PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { ui } from './ui';
// Keep native layout measured while navigation detaches inactive screens. Collapsing
// it on blur makes safe areas and lists reflow on every return. Hide web tab traversal.
export function FocusedTab({ children }: PropsWithChildren) {
  const focused = useIsFocused();
  return (
    <View
      style={[ui.flex, Platform.OS === 'web' && !focused && { display: 'none' }]}
      pointerEvents={focused ? 'auto' : 'none'}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}
