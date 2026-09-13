import { messengerRuntime } from '@/messenger/runtime';
import { useId, useState, type PropsWithChildren, type ReactNode, type Ref } from 'react';
import { FocusPressable as Pressable } from './FocusPressable';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { AppText } from './AppText';
import { AppIcon, type IconName } from './AppIcon';
import { MneloLogo } from './MneloBrand';
import { useAppFont } from '@/theme/fonts';
import { useCallAppearance } from '@/theme/appearance';
import { theme as t } from '@/theme/tokens';
import { useConnectivity } from '@/hooks/useConnectivity';
import { inputMinimumHeight, inputTextStyle } from './input-metrics';
export function Page({
  children,
  title,
  right,
  back = false,
  scroll = true,
  titleLines,
  bottomSafe = true,
  contentStyle,
  headerStyle,
  avatarName,
  avatar,
  onTitlePress,
  titleActionLabel,
  nativeHeader = false,
  nativeKeyboardInsets = false,
  showDevelopmentNotice = true,
}: PropsWithChildren<{
  nativeHeader?: boolean;
  nativeKeyboardInsets?: boolean;
  showDevelopmentNotice?: boolean;
  title?: string;
  right?: ReactNode;
  back?: boolean;
  scroll?: boolean;
  titleLines?: number;
  bottomSafe?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  headerStyle?: StyleProp<ViewStyle>;
  avatarName?: string | undefined;
  avatar?: ReactNode;
  onTitlePress?: (() => void) | undefined;
  titleActionLabel?: string | undefined;
}>) {
  const { t: tr } = useTranslation();
  const online = useConnectivity();
  const insets = useSafeAreaInsets();
  const dark = useCallAppearance();
  const { width, fontScale } = useWindowDimensions();
  const stackedActions = Boolean(back && avatarName && right && fontScale >= 1.4);
  const IdentityContainer = onTitlePress ? Pressable : View;
  const body = <View style={[ui.body, contentStyle]}>{children}</View>;
  return (
    <View
      style={[
        ui.safe,
        dark && ui.callSafe,
        {
          paddingTop: nativeHeader ? 0 : insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: bottomSafe ? insets.bottom : 0,
        },
      ]}
    >
      <KeyboardAvoidingView
        style={ui.flex}
        behavior={
          Platform.OS === 'ios'
            ? scroll && nativeKeyboardInsets
              ? undefined
              : 'padding'
            : Platform.OS === 'android'
              ? 'height'
              : undefined
        }
      >
        {title !== undefined && (
          <View style={[ui.header, headerStyle]}>
            {back && (
              <IconButton
                label={tr('common.back')}
                icon="chevron-left"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              />
            )}
            {!back && title === tr('brand') ? (
              <View style={ui.headerTitle}>
                <MneloLogo />
              </View>
            ) : (
              <IdentityContainer
                style={[ui.headerTitle, ui.headerIdentity]}
                onPress={onTitlePress}
                accessibilityRole={onTitlePress ? 'button' : undefined}
                accessibilityLabel={onTitlePress ? (titleActionLabel ?? title) : undefined}
              >
                {avatarName &&
                  width >= t.layout.compactHeaderWidth &&
                  fontScale < 1.4 &&
                  (avatar ?? <Avatar name={avatarName} size="small" />)}
                <AppText
                  variant={
                    back
                      ? fontScale >= 1.4 || (avatarName && width < t.layout.compactHeaderWidth)
                        ? 'bodyMedium'
                        : 'headline'
                      : 'title'
                  }
                  accessibilityRole="header"
                  latin={title === tr('brand')}
                  style={ui.headerTitle}
                  maxFontSizeMultiplier={t.controls.navigationMaxScale}
                  numberOfLines={titleLines}
                >
                  {title}
                </AppText>
              </IdentityContainer>
            )}
            {!stackedActions && right}
          </View>
        )}
        {title !== undefined && stackedActions && <View style={ui.headerActionRow}>{right}</View>}
        {!online && (
          <View accessibilityRole="alert" style={[ui.notice, dark && ui.callSurface]}>
            <AppText variant="caption">{tr('common.offline')}</AppText>
          </View>
        )}
        {showDevelopmentNotice &&
          !nativeHeader &&
          (messengerRuntime.appEnv === 'local' || messengerRuntime.appEnv === 'development') && (
            <View style={[ui.notice, dark && ui.callSurface]}>
              <AppText
                variant="caption"
                tone="secondary"
                maxFontSizeMultiplier={t.controls.developmentNoticeMaxScale}
              >
                {tr('messenger.localOnly')}
              </AppText>
            </View>
          )}
        {scroll ? (
          <ScrollView
            contentContainerStyle={ui.grow}
            automaticallyAdjustKeyboardInsets={nativeKeyboardInsets}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const dark = useCallAppearance();
  const foreground =
    variant === 'accent'
      ? t.colors.onAccent
      : variant === 'primary'
        ? t.colors.onBlack
        : variant === 'danger'
          ? dark
            ? t.colors.callError
            : t.colors.error
          : dark
            ? t.colors.callText
            : t.colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        variant === 'primary' ? ui.primary : variant === 'accent' ? ui.accent : ui.secondary,
        dark && variant !== 'accent' && ui.callSurface,
        variant === 'danger' && ui.danger,
        (disabled || busy) && ui.disabled,
        pressed &&
          (variant === 'primary'
            ? ui.primaryPressed
            : variant === 'accent'
              ? ui.accentPressed
              : ui.pressed),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <AppText variant="button" centered style={{ color: foreground }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
export function IconButton({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  variant = 'plain',
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'plain' | 'accent' | 'soft';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        ui.icon,
        variant !== 'plain' && ui.iconSurface,
        variant === 'accent' && ui.accent,
        (disabled || busy) && ui.disabled,
        pressed && ui.pressed,
      ]}
    >
      {busy ? <ActivityIndicator color={t.colors.black} /> : <AppIcon name={icon} />}
    </Pressable>
  );
}
export function Field({
  label,
  error,
  hint,
  hideLabel = false,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  hideLabel?: boolean;
  inputRef?: Ref<TextInput>;
}) {
  const { i18n } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const font = useAppFont();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const hintId = id + '-hint',
    errorId = id + '-error';
  const web =
    Platform.OS === 'web'
      ? {
          'aria-invalid': Boolean(error),
          'aria-describedby':
            [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined,
        }
      : {};
  return (
    <View style={ui.field}>
      {!hideLabel && (
        <AppText variant="label" tone="secondary">
          {label}
        </AppText>
      )}
      <TextInput
        ref={inputRef}
        key={fontScale}
        {...props}
        {...web}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        accessibilityLabel={label}
        accessibilityLanguage={i18n.language}
        accessibilityHint={[hint, error].filter(Boolean).join('. ') || undefined}
        placeholderTextColor={t.colors.textSecondary}
        selectionColor={Platform.OS === 'ios' ? t.colors.black : t.colors.accent}
        cursorColor={t.colors.black}
        style={[
          ui.input,
          font,
          { minHeight: inputMinimumHeight(fontScale) },
          props.multiline && ui.multiline,
          focused && (Platform.OS === 'web' ? ui.focus : ui.inputFocus),
          props.style,
        ]}
      />
      {error && (
        <AppText
          nativeID={errorId}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          variant="caption"
          style={ui.dangerText}
        >
          {error}
        </AppText>
      )}
      {hint && (
        <AppText nativeID={hintId} variant="caption" tone="secondary">
          {hint}
        </AppText>
      )}
    </View>
  );
}
export function Avatar({
  name,
  uri,
  size = 'normal',
}: {
  name: string;
  uri?: string | undefined;
  size?: 'small' | 'normal' | 'large' | 'profile';
}) {
  const dark = useCallAppearance();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        ui.avatar,
        size === 'small' && ui.avatarSmall,
        size === 'large' && ui.avatarLarge,
        size === 'profile' && ui.avatarProfile,
        dark && ui.callSurface,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{ width: '100%', height: '100%', borderRadius: t.radii.pill }}
        />
      ) : (
        <AppText
          variant={size === 'profile' ? 'titleLarge' : size === 'large' ? 'title' : 'button'}
          tone="accent"
          maxFontSizeMultiplier={1.4}
        >
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((s) => s[0])
            .join('')
            .toUpperCase() || '·'}
        </AppText>
      )}
    </View>
  );
}
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  accessibilityLabel,
  disabled = false,
  stackRight = false,
  selected,
}: {
  accessibilityLabel?: string;
  title: string;
  subtitle?: string | undefined;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  stackRight?: boolean;
  selected?: boolean;
}) {
  const content = (
    <>
      {left}
      <View style={ui.flex}>
        <AppText variant="bodyMedium">{title}</AppText>
        {Boolean(subtitle) && (
          <AppText variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        )}
        {stackRight && right}
      </View>
      {!stackRight && right}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? title + '. ' + subtitle : title)}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled, ...(selected !== undefined ? { selected } : {}) }}
      style={({ pressed }) => [ui.row, disabled && ui.disabled, pressed && ui.pressed]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={ui.row}>{content}</View>
  );
}
export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={ui.section}>
      <AppText variant="caption" tone="secondary" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}
export function SettingsRow({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Row
      title={title}
      left={<AppIcon name={icon} size={t.icons.md} />}
      right={<AppIcon name="chevron-right" size={t.icons.sm} color={t.colors.textSecondary} />}
      onPress={onPress}
    />
  );
}
export function StateView({
  loading = false,
  error,
  message,
  onRetry,
}: {
  loading?: boolean;
  error?: string | undefined;
  message?: string;
  onRetry?: () => void;
}) {
  const { t: tr } = useTranslation();
  const dark = useCallAppearance();
  return (
    <View style={ui.state}>
      {loading ? (
        <>
          <ActivityIndicator color={dark ? t.colors.callText : t.colors.black} />
          <AppText tone="secondary">{tr('common.loading')}</AppText>
        </>
      ) : (
        <AppText centered accessibilityRole={error ? 'alert' : undefined} tone="secondary">
          {error ?? message ?? tr('common.empty')}
        </AppText>
      )}
      {onRetry && <Button variant="secondary" label={tr('common.retry')} onPress={onRetry} />}
    </View>
  );
}
export function Choice<T extends string>({
  value,
  onChange,
  options,
  layout = 'wrap',
  emphasis = 'neutral',
}: {
  layout?: 'wrap' | 'vertical';
  emphasis?: 'neutral' | 'accent';
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  const { fontScale } = useWindowDimensions();
  const vertical = layout === 'vertical' || fontScale >= 1.4;
  return (
    <View accessibilityRole="radiogroup" style={vertical ? ui.choiceStack : ui.choices}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityLabel={o.label}
          accessibilityState={{ checked: value === o.value }}
          aria-checked={value === o.value}
          onPress={() => onChange(o.value)}
          style={[
            ui.choice,
            vertical && ui.choiceVertical,
            value === o.value && ui.choiceSelected,
            value === o.value && emphasis === 'accent' && ui.choiceAccent,
          ]}
        >
          <AppText
            variant="button"
            centered={!vertical}
            tone={value === o.value ? 'accent' : 'secondary'}
          >
            {value === o.value ? '✓ ' : ''}
            {o.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
export const ui = StyleSheet.create({
  inputFocus: { borderColor: t.colors.focus },
  focus: {
    outlineWidth: t.controls.focusWidth,
    outlineOffset: t.controls.focusOffset,
    outlineStyle: 'solid',
    outlineColor: t.colors.focus,
  },
  safe: { flex: 1, backgroundColor: t.colors.background },
  callSafe: { backgroundColor: t.colors.callBackground },
  callSurface: { backgroundColor: t.colors.callSurface, borderColor: t.colors.callSurface },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: t.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: t.spacing.xl,
    paddingBottom: t.spacing.xl,
    gap: t.spacing.lg,
  },
  headerTitle: { flex: 1, minWidth: 0, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  headerActionRow: {
    alignItems: 'flex-end',
    paddingHorizontal: t.spacing.xl,
    paddingBottom: t.spacing.sm,
  },
  header: {
    minHeight: t.controls.minTapTarget + t.spacing.md * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.xl,
    paddingVertical: t.spacing.md,
  },
  notice: {
    paddingHorizontal: t.spacing.xl,
    paddingVertical: t.spacing.sm,
    backgroundColor: t.colors.surfaceSoft,
  },
  button: {
    minHeight: t.controls.buttonHeight,
    borderRadius: t.radii.md,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: t.colors.black },
  accent: { backgroundColor: t.colors.accent },
  secondary: {
    backgroundColor: t.colors.surface,
    borderWidth: t.controls.borderWidth,
    borderColor: t.colors.controlBorder,
  },
  danger: { borderColor: t.colors.error },
  onAccent: { color: t.colors.onAccent },
  accentText: { color: t.colors.accentText },
  dangerText: { color: t.colors.error },
  disabled: { opacity: t.opacity.disabled },
  pressed: { opacity: t.opacity.pressed },
  primaryPressed: { backgroundColor: t.colors.blackPressed },
  accentPressed: { backgroundColor: t.colors.accentPressed },
  icon: {
    minWidth: t.controls.minTapTarget,
    minHeight: t.controls.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSurface: { backgroundColor: t.colors.surfaceSoft, borderRadius: t.radii.pill },
  field: { gap: t.spacing.sm },
  input: {
    ...inputTextStyle,
    backgroundColor: t.colors.surface,
    borderWidth: t.controls.borderWidth,
    borderColor: t.colors.controlBorder,
    borderRadius: t.radii.md,
    minHeight: t.controls.inputHeight,
  },
  multiline: { minHeight: t.controls.textareaHeight, textAlignVertical: 'top' },
  avatar: {
    width: t.avatar.normal,
    height: t.avatar.normal,
    borderRadius: t.radii.pill,
    backgroundColor: t.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLarge: { width: t.avatar.large, height: t.avatar.large },
  avatarProfile: { width: t.avatar.profile, height: t.avatar.profile },
  avatarSmall: { width: t.avatar.small, height: t.avatar.small },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    paddingVertical: t.spacing.lg,
    borderBottomWidth: t.controls.borderWidth,
    borderBottomColor: t.colors.border,
  },
  section: { gap: t.spacing.sm, marginTop: t.spacing.lg },
  state: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: t.spacing.lg,
    paddingVertical: t.spacing.hero,
  },
  choiceStack: { gap: t.spacing.sm },
  choiceVertical: { flexGrow: 0, flexBasis: 'auto', minHeight: t.controls.minTapTarget },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  choice: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: t.controls.choiceMinWidth,
    padding: t.spacing.md,
    borderRadius: t.radii.md,
    borderWidth: t.controls.borderWidth,
    borderColor: t.colors.controlBorder,
  },
  choiceSelected: { backgroundColor: t.colors.surfaceSoft, borderColor: t.colors.black },
  choiceAccent: { backgroundColor: t.colors.accent, borderColor: t.colors.black },
  hero: { flex: 1, justifyContent: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.hero },
  center: { alignItems: 'center' },
  horizontal: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  caption: { ...t.typography.caption },
  spacer: { height: t.spacing.xl },
  pill: {
    backgroundColor: t.colors.accent,
    borderRadius: t.radii.pill,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
  },
  stack: { gap: t.spacing.md },
});
