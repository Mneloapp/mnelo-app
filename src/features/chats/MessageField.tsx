import { useEffect, useRef, type RefObject } from 'react';
import { useWindowDimensions, type TextInput } from 'react-native';
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
      onFocus={onFocus}
      label={t('chat.message')}
      hideLabel
      value={value}
      editable={editable}
      onChangeText={onChangeText}
      placeholder={t('chat.messagePlaceholder')}
      multiline
      maxLength={8000}
      style={{
        minHeight: minimum,
        height: value ? undefined : minimum,
        maxHeight: maximum,
        borderRadius: theme.radii.xl,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    />
  );
}
