import { Fragment, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, View, useWindowDimensions } from 'react-native';
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
import { NumberKeypad, KeypadCallButton } from './NumberKeypad';
import { useComposer } from './composer-navigation';
import { addPhoneContact, savedPhoneName } from '../phonebook';
import { observePhonebook } from '../phonebook-events';
import { PhonebookAccess } from '../components/PhonebookAccess';

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
  const { height, fontScale } = useWindowDimensions();
  const { engine, identity, calls, mesh, enrollment } = useDevice();
  const { client, status } = usePhoneService();
  const action = usePhoneAction();
  const { finish, returnToPicker } = useComposer();
  const [phone, setPhone] = useState(() => phoneEntryFromNumber(initialNumber, enrollment?.phone));
  const [found, setFound] = useState<string | null | undefined>();
  const [lookupRevision, setLookupRevision] = useState(0);
  const [name, setName] = useState('');
  const [mneloName, setMneloName] = useState('');
  const [phoneNameDraft, setPhoneNameDraft] = useState<string>();
  const [pinned, setPinned] = useState(false);
  const [details, setDetails] = useState(false);
  const [deviceName, setDeviceName] = useState<{ key: string; phone: string; name: string } | null>(
    null,
  );
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
  useEffect(() => {
    if (!found || !normalized || found === identity?.key) return;
    let alive = true;
    let revision = 0;
    const refresh = () => {
      const requested = ++revision;
      void savedPhoneName(normalized, enrollment?.phone)
        .catch(() => null)
        .then((localName) => {
          if (alive && requested === revision)
            setDeviceName(localName ? { key: found, phone: normalized, name: localName } : null);
        });
    };
    refresh();
    const changes = observePhonebook(refresh);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      changes();
      foreground.remove();
    };
  }, [found, normalized, enrollment?.phone, identity?.key, lookupRevision]);
  const displayName =
    deviceName?.key === found && deviceName?.phone === normalized
      ? deviceName.name
      : mneloName || normalized || '';
  const ready = Boolean(client && status.data?.registered);
  function clearResult() {
    setFound(undefined);
    setName('');
    setMneloName('');
    setPhoneNameDraft(undefined);
    setDeviceName(null);
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
      const [contacts, names] = await Promise.all([
        engine.contacts(),
        engine.contactDisplayNames(),
      ]);
      if (!mounted.current || generation.current !== requested) return;
      const bound = contacts.find((item) => item.phone === normalized);
      if (bound && result.key && bound.key !== result.key)
        throw new Error('PHONE_IDENTITY_CHANGED');
      const contact = contacts.find((item) => item.key === result.key);
      setFound(contact?.blocked ? null : result.key);
      setLookupRevision((revision) => revision + 1);
      setName(contact?.blocked ? '' : (contact?.name ?? normalized));
      setMneloName(contact?.blocked ? '' : (result.key && names.get(result.key)) || normalized);
      setPinned(Boolean(contact && !contact.blocked));
      if (keypad && contact && !contact.blocked && contact.key !== identity?.key)
        await dialVoice(contact);
    });
  }
  function continueWithContact() {
    void action.run(async () => {
      if (!found || !normalized || found === identity?.key) return;
      // Recheck local blocking at the action boundary, not only when the lookup returned.
      const contacts = await engine.contacts();
      const bound = contacts.find((item) => item.phone === normalized);
      if (bound && bound.key !== found) throw new Error('PHONE_IDENTITY_CHANGED');
      const contact = contacts.find((item) => item.key === found);
      if (contact?.blocked) {
        clearResult();
        setFound(null);
        return;
      }
      const savedName =
        name.trim() && name.trim() !== normalized ? name.trim() : contact?.name || normalized;
      Keyboard.dismiss();
      if (saveOnly) {
        const requested = generation.current;
        const phoneName = phoneNameDraft ?? displayName;
        if (!(await addPhoneContact(normalized, phoneName, enrollment?.phone))) return;
        if (!mounted.current || generation.current !== requested) return;
        if ((await engine.contacts()).find((item) => item.key === found)?.blocked) return;
      }
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
      {...(!embedded && keypad && !found
        ? {
            scroll: height < 650 || fontScale >= 1.3,
            contentStyle: {
              flex: 1,
              justifyContent: 'flex-end' as const,
              paddingBottom: theme.spacing.xl,
              gap: theme.spacing.lg,
            },
          }
        : {})}
    >
      <PhonebookAccess />
      {!embedded && !keypad && (
        <AppText tone="secondary">{t(dialing ? 'phone.dialHint' : 'phone.searchHint')}</AppText>
      )}
      {!embedded && (
        <PhoneNumberField
          value={phone}
          disabled={action.busy}
          minimal
          dialpad={keypad}
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
      {keypad && !found && (
        <KeypadCallButton disabled={!normalized || !ready} busy={action.busy} onPress={lookup} />
      )}
      {!embedded && !keypad && (dialing || ready) && (
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
                title={displayName}
                subtitle={t('phone.found')}
                left={<Avatar name={displayName} />}
              />
              {!pinned && (
                <AppText variant="caption" tone="secondary">
                  {t('phone.profileAfterConnect')}
                </AppText>
              )}
              {saveOnly && !deviceName && (
                <Field
                  label={t('phone.name')}
                  value={phoneNameDraft ?? (displayName === normalized ? '' : displayName)}
                  onChangeText={setPhoneNameDraft}
                  maxLength={60}
                />
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
              {saveOnly && (
                <AppText variant="caption" tone="secondary">
                  {t('phone.saveToPhoneHint')}
                </AppText>
              )}
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
                  {!saveOnly && (
                    <Field
                      label={t('phone.name')}
                      value={name}
                      onChangeText={setName}
                      maxLength={60}
                    />
                  )}
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
