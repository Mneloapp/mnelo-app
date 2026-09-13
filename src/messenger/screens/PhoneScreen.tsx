import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { MneloLogo } from '@/components/MneloBrand';
import { PhoneNumberField } from '@/components/PhoneNumberField';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { Button, Field, Page, StateView } from '@/components/ui';
import { theme } from '@/theme/tokens';
import { useDevice } from '../DeviceProvider';
import { invitationSnapshot } from '../pending-invitation';
import { normalizePhoneEntry, type PhoneEntry } from '../phone-entry';
import { configuredPhoneService, devicePhoneClient } from '../phone-client';
import { usePhoneAction, usePhoneService } from './phone-shared';
import { RegistrationFooter } from './RegistrationFooter';
import { permitsReviewAccount } from '../review-account';

type Attempt = {
  id: string;
  key: string;
  phone: string;
  expires: number;
  retryAt: number;
  testOnly: boolean;
  reviewAccount: boolean;
};
export function RegistrationScreen() {
  const { authenticated } = useDevice();
  useEffect(() => {
    if (authenticated) router.replace(invitationSnapshot() ? '/contact-invite' : '/(tabs)/chats');
  }, [authenticated]);
  return authenticated ? <WelcomeScreen /> : <PhoneScreen />;
}
export function ChangePhoneScreen() {
  const { client, status } = usePhoneService();
  const { t } = useTranslation();
  if (client && (status.isPending || status.isError))
    return (
      <Page title={t('phone.changeNumber')} back>
        <StateView
          loading={status.isPending}
          error={status.isError ? t('phone.failed') : undefined}
          onRetry={() => void status.refetch()}
        />
      </Page>
    );
  return <PhoneScreen changing initialDiscoverable={status.data?.discoverable ?? false} />;
}
export function PhoneScreen({
  changing = false,
  initialDiscoverable,
}: {
  changing?: boolean;
  initialDiscoverable?: boolean;
}) {
  const { t } = useTranslation();
  const { engine, identity, enrollment } = useDevice();
  const action = usePhoneAction();
  const service = configuredPhoneService();
  const [phone, setPhone] = useState<PhoneEntry>({ country: 'GE', number: '' });
  const [code, setCode] = useState('');
  // New accounts use number discovery by default. A number change keeps the
  // existing privacy choice; the user controls it in Me, outside enrollment.
  const [discoverable] = useState(initialDiscoverable ?? !changing);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!attempt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [attempt]);
  let normalized: string | null = null;
  try {
    normalized = normalizePhoneEntry(phone);
  } catch {
    /* Invalid until complete. */
  }
  const remaining = Math.max(0, Math.ceil(((attempt?.retryAt ?? 0) - now) / 1000));
  const expired = Boolean(attempt && now >= attempt.expires);
  const entry = !changing && !attempt;
  async function client() {
    if (!service) throw new Error('PHONE_REQUEST_FAILED');
    // Generating a local signing identity does not grant app access. Existing keys
    // and histories are retained when an unverified device resumes registration.
    if (!engine.currentIdentity()) await engine.createIdentity();
    const own = engine.currentIdentity();
    const value = devicePhoneClient(own);
    if (!value || !own) throw new Error('PHONE_REQUEST_FAILED');
    return { value, key: own.key };
  }
  function send(number: string) {
    void action.run(async () => {
      const current = await client();
      const response = await current.value.execute({ action: 'send', phone: number });
      if (
        !response.attempt ||
        !response.expires ||
        !response.retryAt ||
        response.testOnly === undefined
      )
        throw new Error('PHONE_REQUEST_FAILED');
      const reviewAccount = Boolean(response.reviewAccount);
      if (
        reviewAccount &&
        (!response.testOnly ||
          !permitsReviewAccount(number, service ?? undefined, process.env.EXPO_PUBLIC_APP_ENV))
      )
        throw new Error('PHONE_REQUEST_FAILED');
      if (
        response.testOnly &&
        !reviewAccount &&
        (process.env.EXPO_PUBLIC_APP_ENV || 'local') !== 'local'
      )
        throw new Error('PHONE_REQUEST_FAILED');
      setCode('');
      setNow(Date.now());
      setAttempt({
        id: response.attempt,
        key: current.key,
        phone: number,
        expires: response.expires,
        retryAt: response.retryAt,
        testOnly: response.testOnly,
        reviewAccount,
      });
    });
  }
  return (
    <Page
      {...(attempt || changing
        ? {
            title: t(
              attempt?.reviewAccount
                ? 'phone.reviewKey'
                : attempt
                  ? 'phone.code'
                  : 'phone.changeNumber',
            ),
          }
        : {})}
      back={changing}
      contentStyle={styles.form}
      nativeKeyboardInsets={!entry}
      showDevelopmentNotice={changing}
    >
      <View style={entry ? styles.entry : styles.step}>
        {entry && (
          <View style={styles.brand}>
            <MneloLogo size="registration" />
          </View>
        )}
        {changing && !attempt && (
          <>
            <AppText tone="secondary">{t('phone.changeHint')}</AppText>
            {enrollment && (
              <AppText>{t('phone.currentNumber', { phone: enrollment.phone })}</AppText>
            )}
          </>
        )}
        {!service ? (
          <StateView message={t('phone.unavailable')} />
        ) : attempt ? (
          <>
            <AppText tone="secondary">
              {t(
                attempt.reviewAccount
                  ? 'phone.reviewInstructions'
                  : attempt.testOnly
                    ? 'phone.fixture'
                    : 'phone.sent',
                { phone: attempt.phone },
              )}
            </AppText>
            <Field
              label={t(attempt.reviewAccount ? 'phone.reviewKey' : 'phone.code')}
              value={code}
              editable={!action.busy}
              onChangeText={(value) =>
                setCode(
                  attempt.reviewAccount
                    ? value
                        .toLowerCase()
                        .replace(/[^a-f0-9]/g, '')
                        .slice(0, 32)
                    : value.replace(/\D/g, '').slice(0, 6),
                )
              }
              keyboardType={attempt.reviewAccount ? 'default' : 'number-pad'}
              textContentType={attempt.reviewAccount ? 'password' : 'oneTimeCode'}
              autoComplete={attempt.reviewAccount ? 'off' : 'sms-otp'}
              secureTextEntry={attempt.reviewAccount}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={attempt.reviewAccount ? 32 : 6}
              autoFocus
            />
            {expired && <AppText accessibilityRole="alert">{t('phone.expires')}</AppText>}
            <Button
              label={t(attempt.reviewAccount ? 'phone.reviewSignIn' : 'phone.verify')}
              disabled={code.length !== (attempt.reviewAccount ? 32 : 6) || expired}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  if (engine.currentIdentity()?.key !== attempt.key)
                    throw new Error('PHONE_REQUEST_FAILED');
                  const current = await client();
                  const result = await current.value.execute({
                    action: 'verify',
                    attempt: attempt.id,
                    code,
                    discoverable,
                  });
                  if (result.registered !== true) throw new Error('PHONE_REQUEST_FAILED');
                  await engine.completePhoneEnrollment(
                    {
                      phone: attempt.phone,
                      service,
                      testOnly: attempt.testOnly,
                      verifiedAt: Date.now(),
                    },
                    attempt.key,
                  );
                  // A failed/cancelled number change leaves the previous enrollment intact.
                  router.replace(
                    changing
                      ? '/(tabs)/me'
                      : invitationSnapshot()
                        ? '/contact-invite'
                        : '/(tabs)/chats',
                  );
                })
              }
            />
            <Button
              variant="secondary"
              label={
                remaining
                  ? t('phone.resendIn', { seconds: remaining })
                  : t(attempt.reviewAccount ? 'phone.reviewRetry' : 'phone.resend')
              }
              disabled={remaining > 0}
              busy={action.busy}
              onPress={() => send(attempt.phone)}
            />
            <Button
              variant="secondary"
              label={t('phone.change')}
              disabled={action.busy}
              onPress={() => {
                setAttempt(null);
                setCode('');
              }}
            />
          </>
        ) : (
          <>
            <PhoneNumberField
              minimal={entry}
              value={phone}
              onChange={setPhone}
              disabled={action.busy}
            />
            {phone.number.length > 0 && !normalized && (
              <AppText variant="caption">{t('phone.nationalInvalid')}</AppText>
            )}
            <Button
              label={t('common.continue')}
              disabled={!normalized}
              busy={action.busy}
              onPress={() => {
                if (normalized) send(normalized);
              }}
            />
          </>
        )}
        {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      </View>
      {entry && <RegistrationFooter canRestore={!identity} />}
    </Page>
  );
}
const styles = StyleSheet.create({
  form: { flex: 0, flexGrow: 1 },
  entry: { flexGrow: 1, justifyContent: 'center', gap: theme.spacing.lg },
  step: { gap: theme.spacing.lg },
  brand: { alignItems: 'center', marginBottom: theme.spacing.xl },
});
