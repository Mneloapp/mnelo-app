import { useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AppText } from '@/components/AppText';
import { MneloLogo, MneloMark } from '@/components/MneloBrand';
import { Button, Field, Page, ui } from '@/components/ui';
import { useAction } from '@/hooks/useAction';
import { repository } from '@/services';
import type { CountryCode } from 'libphonenumber-js/min';
import { CountryPicker } from './CountryPicker';
import { normalizePhone } from './phone';
import { env } from '@/lib/env';
import { useSession } from '@/stores/session';
export function WelcomeScreen() {
  const { t } = useTranslation();
  const session = useSession((s) => s.session);
  useEffect(() => {
    if (session) router.replace(session.profile ? '/(tabs)/chats' : '/identity');
  }, [session]);
  return (
    <Page>
      <View style={[ui.hero, ui.center]}>
        <MneloLogo size="welcome" />
        <AppText centered tone="secondary">
          {t('tagline')}
        </AppText>
        <MneloMark />
      </View>
      <Button label={t('common.continue')} onPress={() => router.push('/phone')} />
    </Page>
  );
}
const phoneSchema = z.object({ number: z.string().regex(/^[+0-9 ()-]{7,30}$/) });
export function PhoneScreen() {
  const { t } = useTranslation();
  const [country, setCountry] = useState<CountryCode>('GE');
  const a = useAction();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(phoneSchema), defaultValues: { number: '' } });
  return (
    <Page title={t('auth.phoneTitle')} back>
      <AppText tone="secondary">
        {t(
          env.appEnv === 'local' && repository().mode === 'supabase'
            ? 'auth.localPhoneExplanation'
            : 'auth.phoneExplanation',
        )}
      </AppText>
      <CountryPicker value={country} onChange={setCountry} />
      <Controller
        control={control}
        name="number"
        render={({ field }) => (
          <Field
            label={t('auth.phone')}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel-national"
            error={errors.number ? t('auth.phoneInvalid') : undefined}
          />
        )}
      />
      {a.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {a.error}
        </AppText>
      )}
      <Button
        label={t('common.continue')}
        busy={a.busy}
        onPress={() =>
          void handleSubmit(({ number }) => {
            void a.run(
              async () => {
                const phone = normalizePhone(number, country, env.appEnv === 'local');
                await repository().requestOtp(phone);
                return phone;
              },
              (phone) => {
                useSession.getState().setPhone(phone);
                router.push('/otp');
              },
            );
          })()
        }
      />
      <AppText variant="caption" tone="secondary">
        {t('auth.privacyNote')}
      </AppText>
    </Page>
  );
}
export function OtpScreen() {
  const { t } = useTranslation();
  const phone = useSession((s) => s.phone);
  const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(60);
  const a = useAction();
  useEffect(() => {
    const timer = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Page title={t('auth.otpTitle')} back>
      <AppText tone="secondary">
        {t(
          env.appEnv === 'local' && repository().mode === 'supabase'
            ? 'auth.localOtpExplanation'
            : 'auth.otpExplanation',
        )}
      </AppText>
      {repository().mode === 'preview' && (
        <AppText variant="caption">{t('auth.previewOtp')}</AppText>
      )}
      <Field
        label={t('auth.code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={6}
        autoFocus
      />
      {a.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {a.error}
        </AppText>
      )}
      <Button
        label={t('common.continue')}
        busy={a.busy}
        disabled={code.length !== 6 || !phone}
        onPress={() =>
          void a.run(
            () => repository().verifyOtp(phone, code),
            (s) => {
              useSession.getState().setSession(s);
              router.replace(s.profile ? '/(tabs)/chats' : '/identity');
            },
          )
        }
      />
      <Button
        variant="secondary"
        label={remaining ? t('auth.resendIn', { seconds: remaining }) : t('auth.resend')}
        disabled={remaining > 0 || !phone}
        onPress={() =>
          void a.run(
            () => repository().requestOtp(phone),
            () => setRemaining(60),
          )
        }
      />
    </Page>
  );
}
const identitySchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  username: z.string().regex(/^[a-z][a-z0-9_]{2,23}$/),
});
export function IdentityScreen() {
  const { t } = useTranslation();
  const a = useAction();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(identitySchema),
    defaultValues: { displayName: '', username: '' },
  });
  return (
    <Page title={t('auth.identityTitle')}>
      <Controller
        control={control}
        name="displayName"
        render={({ field }) => (
          <Field
            label={t('profile.displayName')}
            value={field.value}
            onChangeText={field.onChange}
            autoComplete="name"
            maxLength={60}
            error={errors.displayName ? t('common.invalid') : undefined}
          />
        )}
      />
      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <Field
            label={t('profile.username')}
            value={field.value}
            onChangeText={(v) => field.onChange(v.toLowerCase().replace(/^@/, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('profile.usernamePlaceholder')}
            hint={t('profile.usernameHint')}
            error={errors.username ? t('common.invalid') : undefined}
          />
        )}
      />
      <AppText variant="caption" tone="secondary">
        {t('auth.photoLater')}
      </AppText>
      {a.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {a.error}
        </AppText>
      )}
      <Button
        label={t('common.continue')}
        busy={a.busy}
        onPress={() =>
          void handleSubmit((input) => {
            void a.run(
              () => repository().saveProfile({ ...input, bio: '', capabilities: [], area: '' }),
              (p) => {
                useSession.getState().setProfile(p);
                router.replace('/capability');
              },
            );
          })()
        }
      />
    </Page>
  );
}
export function CapabilityScreen() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const a = useAction();
  const p = useSession((s) => s.session?.profile);
  const finish = () => router.replace('/(tabs)/chats');
  return (
    <Page title={t('auth.capabilityTitle')}>
      <Field
        label={t('profile.capabilities')}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={240}
        placeholder={t('auth.capabilityExample')}
      />
      {a.error && (
        <AppText accessibilityRole="alert" style={ui.dangerText}>
          {a.error}
        </AppText>
      )}
      <Button
        label={t('common.continue')}
        busy={a.busy}
        disabled={!p}
        onPress={() => {
          if (p)
            void a.run(
              () =>
                repository().saveProfile({ ...p, capabilities: text.trim() ? [text.trim()] : [] }),
              (updated) => {
                useSession.getState().setProfile(updated);
                finish();
              },
            );
        }}
      />
      <Button label={t('common.skip')} variant="secondary" onPress={finish} />
    </Page>
  );
}
