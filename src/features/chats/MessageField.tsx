import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, useWindowDimensions, type TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { inputMinimumHeight } from '@/components/input-metrics';

// Explicit bounds keep native multiline measurements from leaving an empty composer expanded.
// The input stays mounted, retaining keyboard focus when a message is sent.
export function MessageField({
  value,
  onChangeText,
  focusKey,
  onFocus,
  inputRef,
  editable = true,
}: {
  value: string;
  editable?: boolean;
  onChangeText: (text: string) => void;
  focusKey?: string | undefined;
  onFocus?: () => void;
  inputRef?: RefObject<TextInput | null>;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const minimum = inputMinimumHeight(fontScale);
  const maximum = Math.max(minimum, theme.controls.textareaHeight);
  const [inputWidth, setInputWidth] = useState(0);
  const [measurement, setMeasurement] = useState({
    value: '',
    fontScale,
    width: 0,
    height: minimum,
  });
  const [focused, setFocused] = useState(false);
  const lines = value.split(/\r\n|\r|\n/).length;
  // Prefilled edits can update iOS text without emitting content-size events.
  // Native layout measures wrapped text; explicit breaks also set a safe floor.
  // This estimate affects box height only, never the input's native lineHeight.
  const contentMinimum = Math.min(
    maximum,
    Math.max(
      minimum,
      Math.ceil(
        lines * theme.typography.body.lineHeight * fontScale +
          theme.spacing.md * 2 +
          theme.controls.borderWidth * 2,
      ),
    ),
  );
  const measuredHeight =
    measurement.value === value &&
    measurement.fontScale === fontScale &&
    measurement.width === inputWidth
      ? measurement.height
      : contentMinimum;
  const height = !value
    ? minimum
    : Platform.OS === 'web'
      ? Math.max(contentMinimum, Math.min(maximum, measuredHeight))
      : undefined;
  const fallbackInput = useRef<TextInput>(null);
  const input = inputRef ?? fallbackInput;
  useEffect(() => {
    if (!focusKey) return;
    const timer = setTimeout(() => input.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [focusKey, input]);
  return (
    <Field
      inputRef={input}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      label={t('chat.message')}
      hideLabel
      value={value}
      editable={editable}
      onChangeText={onChangeText}
      placeholder={t('chat.messagePlaceholder')}
      multiline
      // Keep oversized pasted/edited drafts scrollable even if a native size
      // callback is skipped. A short field has no scrollable content anyway.
      scrollEnabled={Boolean(value)}
      onLayout={
        Platform.OS === 'web' ? (event) => setInputWidth(event.nativeEvent.layout.width) : undefined
      }
      onContentSizeChange={
        Platform.OS === 'web'
          ? (event) =>
              setMeasurement({
                value,
                fontScale,
                width: inputWidth,
                height: Math.ceil(event.nativeEvent.contentSize.height),
              })
          : undefined
      }
      maxLength={8000}
      style={{
        minHeight: value ? contentMinimum : minimum,
        height,
        maxHeight: maximum,
        paddingHorizontal: theme.spacing.xs,
        textAlignVertical: 'center',
        borderRadius: theme.radii.lg,
        borderColor: Platform.OS === 'web' && focused ? theme.colors.focus : 'transparent',
        backgroundColor: 'transparent',
      }}
    />
  );
}
