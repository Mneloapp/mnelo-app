import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FocusPressable } from '@/components/FocusPressable';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { theme } from '@/theme/tokens';
const keys = [
  ['1', ''],
  ['2', 'ABC'],
  ['3', 'DEF'],
  ['4', 'GHI'],
  ['5', 'JKL'],
  ['6', 'MNO'],
  ['7', 'PQRS'],
  ['8', 'TUV'],
  ['9', 'WXYZ'],
  ['+', ''],
  ['0', ''],
  ['delete', ''],
] as const;
export function NumberKeypad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { fontScale, width, height } = useWindowDimensions();
  const diameter = Math.max(
    theme.controls.minTapTarget,
    Math.min(80, (height - 280) / 5, (width - theme.spacing.xl * 2 - theme.spacing.md * 2) / 3),
  );
  const minHeight = Math.max(
    diameter,
    (theme.typography.title.lineHeight + theme.typography.micro.lineHeight) * fontScale +
      theme.spacing.xs * 2,
  );
  return (
    <View style={styles.pad}>
      {keys.map(([digit, letters]) => (
        <FocusPressable
          key={digit}
          accessibilityRole="button"
          accessibilityLabel={
            digit === 'delete'
              ? t('compose.deleteDigit')
              : digit === '+'
                ? t('compose.plus')
                : digit
          }
          accessibilityHint={digit === 'delete' ? t('compose.clearNumber') : undefined}
          disabled={disabled}
          accessibilityState={{ disabled }}
          onPress={() =>
            onChange(
              digit === 'delete'
                ? value.slice(0, -1)
                : digit === '+'
                  ? value.startsWith('+')
                    ? value
                    : '+' + value
                  : (value + digit).slice(0, 30),
            )
          }
          onLongPress={
            digit === 'delete'
              ? () => onChange('')
              : digit === '0'
                ? () => onChange(value.startsWith('+') ? value : '+' + value)
                : undefined
          }
          style={({ pressed }) => [
            styles.key,
            { width: diameter, minHeight },
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          {digit === 'delete' ? (
            <AppIcon name="delete" />
          ) : (
            <>
              <AppText latin centered style={{ fontSize: 32, lineHeight: 38, fontWeight: '400' }}>
                {digit}
              </AppText>
              {(letters !== '' || digit === '0') && (
                <AppText
                  latin
                  variant="micro"
                  centered
                  style={{ fontSize: 10, lineHeight: 14, letterSpacing: 2 }}
                >
                  {digit === '0' ? '+' : letters}
                </AppText>
              )}
            </>
          )}
        </FocusPressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  key: {
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  pressed: { backgroundColor: theme.colors.accentSoft },
  disabled: { opacity: theme.opacity.disabled },
});

export function KeypadCallButton({
  disabled,
  busy,
  onPress,
}: {
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={t('messenger.callVoice')}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 72,
        height: 72,
        borderRadius: 36,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent,
        opacity: disabled || busy ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.black} />
      ) : (
        <AppIcon name="phone" size={28} color={theme.colors.black} />
      )}
    </FocusPressable>
  );
}
