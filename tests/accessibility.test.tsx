import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Button, Choice, Field, IconButton, Row, ui } from '@/components/ui';
import { AppText } from '@/components/AppText';
import { ActionSheet } from '@/components/ActionSheet';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';
function MotionPreference() {
  const reduced = useReducedMotion();
  return <AppText>{reduced ? 'Reduced' : 'Animated'}</AppText>;
}
test('field error and guidance are available from its accessible hint; scaling is not disabled', async () => {
  await render(
    <Field
      label="Phone number"
      hint="Include the country code"
      error="Check the number"
      value=""
    />,
  );
  const field = screen.getByLabelText('Phone number');
  expect(field.props.accessibilityHint).toBe('Include the country code. Check the number');
  expect(field.props.allowFontScaling).not.toBe(false);
  expect(screen.getByRole('alert')).toHaveTextContent('Check the number');
});
test('buttons expose busy/disabled state and keyboard focus has a visible outline', async () => {
  await render(
    <>
      <Button label="Save" busy onPress={jest.fn()} />
      <IconButton label="Search" icon="search" onPress={jest.fn()} />
    </>,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  const search = screen.getByRole('button', { name: 'Search' });
  await fireEvent(search, 'focus', {});
  expect(StyleSheet.flatten(search.props.style).outlineWidth).toBeGreaterThanOrEqual(2);
  expect(ui.icon.minHeight).toBeGreaterThanOrEqual(48);
});
test('radio choices expose state independently of color', async () => {
  const change = jest.fn();
  await render(
    <Choice
      value="nobody"
      onChange={change}
      options={[
        { value: 'nobody', label: 'Nobody' },
        { value: 'everyone', label: 'Everyone' },
      ]}
    />,
  );
  expect(screen.getByRole('radio', { name: 'Nobody' }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('radio', { name: 'Everyone' }));
  expect(change).toHaveBeenCalledWith('everyone');
});
test('motion starts conservatively and follows live OS preference changes', async () => {
  let changed!: (value: boolean) => void;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const original = AccessibilityInfo.addEventListener;
  Object.defineProperty(AccessibilityInfo, 'addEventListener', {
    configurable: true,
    value: (event: string, handler: (value: boolean) => void) => {
      if (event === 'reduceMotionChanged') changed = handler;
      return { remove };
    },
  });
  const rendered = await render(<MotionPreference />);
  expect(screen.getByText('Reduced')).toBeOnTheScreen();
  await act(() => changed(false));
  expect(screen.getByText('Animated')).toBeOnTheScreen();
  await rendered.unmount();
  expect(remove).toHaveBeenCalled();
  Object.defineProperty(AccessibilityInfo, 'addEventListener', {
    configurable: true,
    value: original,
  });
  jest.restoreAllMocks();
});
test('action sheet exposes a named modal and an accessible escape action', async () => {
  const close = jest.fn();
  await render(
    <ActionSheet title="Message actions" visible onClose={close}>
      <Button label="Cancel" onPress={close} />
    </ActionSheet>,
  );
  expect(screen.getByRole('header', { name: 'Message actions' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledTimes(1);
});
function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}
test('central text and control tokens meet contrast thresholds on supported surfaces', () => {
  for (const background of [
    theme.colors.background,
    theme.colors.surface,
    theme.colors.accentSoft,
    theme.colors.surfaceSoft,
  ]) {
    for (const text of [
      theme.colors.textPrimary,
      theme.colors.textSecondaryOnSoft,
      theme.colors.accentText,
      theme.colors.error,
    ])
      expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.colors.controlBorder, background)).toBeGreaterThanOrEqual(3);
  }
  expect(contrast(theme.colors.onAccent, theme.colors.accent)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.textSecondary, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.textSecondary, theme.colors.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.onBlack, theme.colors.black)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.callText, theme.colors.callSurface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.callText, theme.colors.endCall)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.callSecondary, theme.colors.callBackground)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(contrast(theme.colors.callError, theme.colors.callBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(theme.colors.focus, theme.colors.background)).toBeGreaterThanOrEqual(3);
});

test('group selection exposes its state with the person name to assistive technology', async () => {
  const change = jest.fn();
  const result = await render(<Row title="Development Mariam" selected={false} onPress={change} />);
  expect(
    screen.getByRole('button', { name: 'Development Mariam' }).props.accessibilityState.selected,
  ).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Development Mariam' }));
  expect(change).toHaveBeenCalledTimes(1);
  await result.rerender(<Row title="Development Mariam" selected onPress={change} />);
  expect(
    screen.getByRole('button', { name: 'Development Mariam' }).props.accessibilityState.selected,
  ).toBe(true);
});
