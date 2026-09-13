import { theme } from '@/theme/tokens';

// Native single-line inputs measure their own font ascent/descent. A Text lineHeight
// applied here clips Georgian glyphs and shifts the iOS editing baseline.
export const inputTextStyle = {
  fontSize: theme.typography.body.fontSize,
  color: theme.colors.textPrimary,
  paddingHorizontal: theme.spacing.md,
  paddingVertical: theme.spacing.md,
  textAlignVertical: 'center',
} as const;
export function inputMinimumHeight(fontScale: number) {
  return Math.max(
    theme.controls.inputHeight,
    Math.ceil(
      theme.typography.body.lineHeight * fontScale +
        theme.spacing.md * 2 +
        theme.controls.borderWidth * 2,
    ),
  );
}
