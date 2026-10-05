import { useState } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { theme } from '@/theme/tokens';
import { useCallAppearance } from '@/theme/appearance';
export function FocusPressable({
  style,
  onFocus,
  onBlur,
  focusColor,
  ...props
}: PressableProps & { focusColor?: string }) {
  const [focused, setFocused] = useState(false);
  const dark = useCallAppearance();
  return (
    <Pressable
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        focused && styles.focus,
        focused && dark && { outlineColor: theme.colors.callText },
        focused && focusColor && { outlineColor: focusColor },
      ]}
    />
  );
}
const styles = StyleSheet.create({
  focus: {
    outlineColor: theme.colors.focus,
    outlineStyle: 'solid',
    outlineWidth: theme.controls.focusWidth,
    outlineOffset: theme.controls.focusOffset,
  },
});
