import { Fragment, useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme/tokens';
import { AppText } from '@/components/AppText';
import { Avatar, Button, Field, Page, Row, StateView } from '@/components/ui';
import { useDevice } from '../DeviceProvider';
import { PhoneNumberField } from '@/components/PhoneNumberField';
import { normalizePhoneEntry, phoneEntryFromNumber, updatePhoneEntry } from '../phone-entry';
import { usePhoneService, usePhoneAction } from './phone-shared';
import { CallActions, type CallTarget } from './CallActions';
import { NumberKeypad } from './NumberKeypad';
import { useComposer } from './composer-navigation';
import { phonebookPermission, requestPhonebookPermission, savedPhoneName } from '../phonebook';

export function FindPhoneScreen({
  intent = 'chat',
  nativeHeader = false,
  keypad = false,
  initialNumber = '',
  saveOnly = false,
  embedded = false,
}: {
  intent?: 'chat' | 'call';
  nativeHeader?: boolean;
  keypad?: boolean;
  initialNumber?: string;
  saveOnly?: boolean;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const { engine, identity, calls, mesh, enrollment } = useDevice();
  const { client, status } = usePhoneService();
  const action = usePhoneAction();
  const { finish, returnToPicker } = useComposer();
  const [phone, setPhone] = useState(() => phoneEntryFromNumber(initialNumber, enrollment?.phone));
  const [found, setFound] = useState<string | null | undefined>();
  const [name, setName] = useState('');
  const [pinned, setPinned] = useState(false);
  const [details, setDetails] = useState(false);
  const [localNames, setLocalNames] = useState(false);
  useEffect(() => {
    let current = true;
    void phonebookPermission()
      .then((value) => {
        if (current) setLocalNames(value);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [selected, setSelected] = useState<CallTarget | null>(null);
  const dialing = intent === 'call';
  let normalized: string | null = null;
  try {
    normalized = normalizePhoneEntry(phone);
  } catch {
    /* No lookup until the selected country and national number are valid. */
  }
  const ready = Boolean(client && status.data?.registered);
  function clearResult() {
    setFound(undefined);
    setName('');
    setDetails(false);
    generation.current++;
    setPinned(false);
    setSelected(null);
  }
  async function dialVoice(target: CallTarget) {
    const contact = (await engine.contacts()).find(
      (item) => item.key === target.key && !item.blocked,
    );
    if (!contact || target.key === identity?.key) {
      clearResult();
      setFound(null);
      return;
    }
    const current = calls?.snapshot();
    if (current && !['ended', 'failed'].includes(current.status)) {
      finish({ pathname: '/call/[id]', params: { id: current.chat } });
      return;
    }
    await mesh?.focus(contact.key);
    if (!calls || (!calls.supportsQueuedSignaling && !mesh?.online(contact.key))) {
      setSelected(contact);
      return;
    }
    const id = await engine.trustContact({ key: contact.key, name: contact.name });
    await calls.start(contact.key, 'voice');
    finish({ pathname: '/call/[id]', params: { id } });
  }
  function lookup() {
    void action.run(async () => {
      if (!client || !normalized || !ready) return;
      if (!embedded) Keyboard.dismiss();
      clearResult();
      const requested = ++generation.current;
      const result = await client.execute({ action: 'lookup', phone: normalized });
      if (!mounted.current || generation.current !== requested) return;
      if (result.key === undefined) throw new Error('PHONE_REQUEST_FAILED');
      const contacts = await engine.contacts();
      if (!mounted.current || generation.current !== requested) return;
      const bound = contacts.find((item) => item.phone === normalized);
      if (bound && result.key && bound.key !== result.key)
        throw new Error('PHONE_IDENTITY_CHANGED');
      const contact = contacts.find((item) => item.key === result.key);
      const deviceName =
        result.key && !contact?.blocked
          ? await savedPhoneName(normalized, enrollment?.phone).catch(() => null)
          : null;
      if (!mounted.current || generation.current !== requested) return;
      setFound(contact?.blocked ? null : result.key);
      setName(contact?.blocked ? '' : (deviceName ?? contact?.name ?? normalized));
      setPinned(Boolean(contact && !contact.blocked));
      if (keypad && contact && !contact.blocked && contact.key !== identity?.key)
        await dialVoice(contact);
    });
  }
  function continueWithContact() {
    void action.run(async () => {
      if (!found || !normalized || found === identity?.key) return;
      // Recheck local blocking at the action boundary, not only when the lookup returned.
      const contact = (await engine.contacts()).find((item) => item.key === found);
      if (contact?.blocked) {
        clearResult();
        setFound(null);
        return;
      }
      const savedName =
        name.trim() && name.trim() !== normalized ? name.trim() : contact?.name || normalized;
      const id = await engine.trustPhoneContact({ key: found, phone: normalized, name: savedName });
      await engine.trustContact({ key: found, name: savedName });
      Keyboard.dismiss();
      if (saveOnly) returnToPicker();
      else if (keypad) await dialVoice({ key: found, name: savedName });
      else if (dialing) setSelected({ key: found, name: savedName });
      else if (nativeHeader) finish({ pathname: '/chat/[id]', params: { id } });
      else router.push({ pathname: '/chat/[id]', params: { id } });
    });
  }
  const lookupRef = useRef(lookup);
  useEffect(() => {
    lookupRef.current = lookup;
  });
  useEffect(() => {
    if (!embedded || !ready || !normalized) return;
    const timer = setTimeout(() => lookupRef.current(), 450);
    return () => clearTimeout(timer);
  }, [embedded, ready, normalized]);
  const Container = embedded ? Fragment : Page;
  return (
    <Container
      {...(embedded
        ? {}
        : nativeHeader
          ? { nativeHeader: true }
          : { title: t(dialing ? 'phone.dial' : 'phone.search'), back: true })}
    >
      {!localNames && (
        <Button
          variant="secondary"
          label={t('phone.contactNames')}
          onPress={() =>
            void action.run(async () => {
              const requested = generation.current;
              const allowed = await requestPhonebookPermission();
              if (!mounted.current) return;
              setLocalNames(allowed);
              if (allowed && found && normalized) {
                const localName = await savedPhoneName(normalized, enrollment?.phone);
                if (mounted.current && generation.current === requested && localName)
                  setName(localName);
              }
            })
          }
        />
      )}
      {!embedded && !keypad && (
        <AppText tone="secondary">{t(dialing ? 'phone.dialHint' : 'phone.searchHint')}</AppText>
      )}
      {!embedded && (
        <PhoneNumberField
          value={phone}
          disabled={action.busy}
          minimal
          showSoftInputOnFocus={!keypad}
          onChange={(value) => {
            setPhone(value);
            clearResult();
          }}
        />
      )}
      {!embedded && !keypad && Boolean(phone.number.trim()) && !normalized && (
        <AppText variant="caption" tone="secondary">
          {t('phone.nationalInvalid')}
        </AppText>
      )}
      {keypad && !found && (
        <NumberKeypad
          value={phone.number}
          onChange={(value) => {
            setPhone(updatePhoneEntry(phone, value));
            clearResult();
          }}
          disabled={action.busy}
        />
      )}
      {!embedded && (dialing || ready) && !(keypad && found) && (
        <Button
          label={t(keypad ? 'messenger.callVoice' : dialing ? 'phone.findToCall' : 'phone.find')}
          disabled={!normalized || !ready}
          busy={action.busy}
          onPress={lookup}
        />
      )}
      {embedded && (action.busy || found === undefined) && ready && !action.error && (
        <StateView loading />
      )}
      {!client ? (
        <StateView message={t('phone.unavailable')} />
      ) : !ready ? (
        <>
          <StateView
            loading={status.isPending}
            error={status.isError ? t('phone.failed') : undefined}
            message={t('phone.registeredRequired')}
            {...(status.isError ? { onRetry: () => void status.refetch() } : {})}
          />
          {!status.isPending && !status.isError && (
            <Button label={t('phone.verify')} onPress={() => router.push('/phone')} />
          )}
        </>
      ) : (
        <>
          {found === null && <StateView message={t('phone.noResult')} />}
          {found === identity?.key ? (
            <AppText>{t('phone.own')}</AppText>
          ) : found ? (
            <View style={{ gap: theme.spacing.md }}>
              <Row
                title={name || normalized || ''}
                subtitle={t('phone.found')}
                left={<Avatar name={name || normalized || ''} />}
              />
              {!pinned && (
                <AppText variant="caption" tone="secondary">
                  {t('phone.profileAfterConnect')}
                </AppText>
              )}
              <Button
                label={t(
                  keypad
                    ? 'messenger.callVoice'
                    : dialing
                      ? 'phone.continueCall'
                      : saveOnly
                        ? 'messenger.addContact'
                        : 'phone.startChat',
                )}
                busy={action.busy}
                onPress={continueWithContact}
              />
              {!pinned && (
                <AppText variant="caption" tone="secondary">
                  {t('phone.mutualContact')}
                </AppText>
              )}
              <Button
                variant="secondary"
                label={t(details ? 'phone.hideDetails' : 'phone.details')}
                onPress={() => setDetails(!details)}
              />
              {details && (
                <>
                  <Field
                    label={t('phone.name')}
                    value={name}
                    onChangeText={setName}
                    maxLength={60}
                  />
                  <AppText selectable variant="caption">
                    {'mnelo1:' + found}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {t('phone.verifyIdentity')}
                  </AppText>
                </>
              )}
            </View>
          ) : null}
        </>
      )}
      {action.error && (
        <>
          <AppText accessibilityRole="alert">{action.error}</AppText>
          {embedded && <Button label={t('phone.find')} onPress={lookup} busy={action.busy} />}
        </>
      )}
      {selected && (
        <CallActions
          target={selected}
          onClose={() => setSelected(null)}
          {...(nativeHeader
            ? { onStarted: (id: string) => finish({ pathname: '/call/[id]', params: { id } }) }
            : {})}
        />
      )}
    </Container>
  );
}
