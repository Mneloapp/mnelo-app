import { useMemo, useState } from 'react';
import { Keyboard, SectionList, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FocusPressable } from '@/components/FocusPressable';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { AppText } from '@/components/AppText';
import { IconButton, Page, Row, StateView, ui } from '@/components/ui';
import { PeerAvatar } from '../components/ContactCard';
import { theme } from '@/theme/tokens';
import { CountryPicker } from '@/components/CountryPicker';
import { FindPhoneScreen } from './FindPhoneScreen';
import { normalizePhoneEntry, phoneEntryFromNumber, updatePhoneEntry } from '../phone-entry';
import { SearchField } from '@/components/SearchField';
import { useDevice } from '../DeviceProvider';
import type { Contact } from '../model';
import { CallActions, CurrentCall, type CallTarget } from './CallActions';
import { useLocalAction } from './shared';
import { useComposer } from './composer-navigation';

export function PickerAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && ui.pressed]}
    >
      <View style={styles.actionIcon}>
        <AppIcon name={icon} size={theme.icons.sm} />
      </View>
      <AppText variant="bodyMedium" style={ui.flex}>
        {label}
      </AppText>
      <AppIcon name="chevron-right" size={theme.icons.sm} color={theme.colors.textSecondary} />
    </FocusPressable>
  );
}
export function ContactPickerScreen({ mode }: { mode: 'chat' | 'call' }) {
  const { engine, calls, mesh, enrollment } = useDevice();
  const { t, i18n } = useTranslation();
  const { finish } = useComposer();
  const action = useLocalAction();
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState(() => phoneEntryFromNumber('', enrollment?.phone).country);
  const numeric = /^\+?[0-9(][0-9 ()-]*$/.test(search.trim());
  function changeSearch(value: string) {
    const entry = updatePhoneEntry({ country, number: search }, value);
    setSearch(entry.number);
    setCountry(entry.country);
  }
  const [unavailable, setUnavailable] = useState<CallTarget | null>(null);
  const q = useQuery({
    queryKey: ['device', 'contacts'],
    queryFn: () => engine.contacts(),
    networkMode: 'always',
  });
  const sections = useMemo(() => {
    const rows = (q.data ?? [])
      .filter(
        (contact) =>
          !contact.blocked &&
          (contact.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) ||
            Boolean(contact.phone?.includes(search.replace(/[^0-9]/g, '')) && numeric)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
    const groups: { title: string; data: Contact[] }[] = [];
    for (const row of rows) {
      const title = Array.from(row.name.trim())[0]?.toLocaleUpperCase() || '#';
      const last = groups.at(-1);
      if (last?.title === title) last.data.push(row);
      else groups.push({ title, data: [row] });
    }
    return groups;
  }, [q.data, search, i18n.language, numeric]);
  let phone: string | null = null;
  try {
    if (numeric) phone = normalizePhoneEntry({ country, number: search });
  } catch {
    /* Only submit whole known numbers. */
  }
  function openChat(contact: Contact) {
    void action.run(async () => {
      const latest = (await engine.contacts()).find(
        (row) => row.key === contact.key && !row.blocked,
      );
      if (!latest) throw new Error('CONTACT_UNAVAILABLE');
      const id = await engine.trustContact({ key: latest.key, name: latest.name });
      Keyboard.dismiss();
      finish({ pathname: '/chat/[id]', params: { id } });
    });
  }
  function startCall(contact: Contact, media: 'voice' | 'video') {
    void action.run(async () => {
      const latest = (await engine.contacts()).find(
        (row) => row.key === contact.key && !row.blocked,
      );
      if (!latest) throw new Error('CONTACT_UNAVAILABLE');
      Keyboard.dismiss();
      const current = calls?.snapshot();
      if (current && !['ended', 'failed'].includes(current.status)) {
        finish({ pathname: '/call/[id]', params: { id: current.chat } });
        return;
      }
      await mesh?.focus(latest.key);
      if (!calls || (!calls.supportsQueuedSignaling && !mesh?.online(latest.key))) {
        setUnavailable(latest);
        return;
      }
      const id = await engine.trustContact({ key: latest.key, name: latest.name });
      await calls.start(latest.key, media);
      finish({ pathname: '/call/[id]', params: { id } });
    });
  }
  return (
    <Page nativeHeader scroll={false} contentStyle={ui.flex}>
      <SearchField
        label={t('compose.search')}
        value={search}
        onChangeText={changeSearch}
        leading={
          numeric ? <CountryPicker inline value={country} onChange={setCountry} /> : undefined
        }
      />
      {mode === 'call' && (
        <CurrentCall onOpen={(id) => finish({ pathname: '/call/[id]', params: { id } })} />
      )}
      <SectionList
        sections={phone ? [] : sections}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled
        initialNumToRender={16}
        windowSize={7}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {!search.trim() && (
              <View style={styles.actions}>
                {mode === 'chat' ? (
                  <PickerAction
                    label={t('messenger.newGroup')}
                    icon="users"
                    onPress={() => router.push('/new-group')}
                  />
                ) : (
                  <PickerAction
                    label={t('compose.keypad')}
                    icon="grid"
                    onPress={() => router.push('/dial-number')}
                  />
                )}
                <PickerAction
                  label={t('compose.newContact')}
                  icon="user-plus"
                  onPress={() => router.push('/new-contact')}
                />
                <PickerAction
                  label={t('card.scan')}
                  icon="maximize"
                  onPress={() => router.push('/scan-contact')}
                />
                <PickerAction
                  label={t('compose.invite')}
                  icon="share-2"
                  onPress={() =>
                    void action.run(async () => {
                      await Share.share({ message: t('compose.invitation') });
                    })
                  }
                />
              </View>
            )}
            {phone ? (
              <FindPhoneScreen
                key={phone}
                embedded
                nativeHeader
                initialNumber={phone}
                intent={mode === 'call' ? 'call' : 'chat'}
              />
            ) : (
              <AppText variant="caption" tone="secondary" style={styles.contactsTitle}>
                {t('compose.contacts')}
              </AppText>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <AppText
            variant="caption"
            tone="secondary"
            accessibilityRole="header"
            style={styles.sectionHeader}
          >
            {section.title}
          </AppText>
        )}
        renderItem={({ item }) =>
          mode === 'chat' ? (
            <Row
              title={item.name}
              left={<PeerAvatar peer={item.key} name={item.name} />}
              disabled={action.busy}
              onPress={() => openChat(item)}
            />
          ) : (
            <Row
              title={item.name}
              left={<PeerAvatar peer={item.key} name={item.name} />}
              right={
                <View style={ui.headerActions}>
                  <IconButton
                    icon="phone"
                    label={t('compose.voice', { name: item.name })}
                    disabled={action.busy}
                    onPress={() => startCall(item, 'voice')}
                  />
                  <IconButton
                    icon="video"
                    label={t('compose.video', { name: item.name })}
                    disabled={action.busy}
                    onPress={() => startCall(item, 'video')}
                  />
                </View>
              }
            />
          )
        }
        ListEmptyComponent={
          phone ? null : (
            <StateView
              loading={q.isPending}
              error={q.isError ? t('messenger.genericError') : undefined}
              message={t(search ? 'compose.noResults' : 'compose.noContacts')}
              {...(q.isError ? { onRetry: () => void q.refetch() } : {})}
            />
          )
        }
      />
      {action.error && <AppText accessibilityRole="alert">{action.error}</AppText>}
      {unavailable && (
        <CallActions
          target={unavailable}
          onClose={() => setUnavailable(null)}
          onStarted={(id) => finish({ pathname: '/call/[id]', params: { id } })}
        />
      )}
    </Page>
  );
}
export function NewContactScreen() {
  return <FindPhoneScreen nativeHeader saveOnly />;
}
const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xl },
  actions: { marginBottom: theme.spacing.lg },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.buttonHeight,
    paddingVertical: theme.spacing.md,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: theme.controls.borderWidth,
  },
  actionIcon: {
    width: theme.avatar.small,
    height: theme.avatar.small,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentSoft,
  },
  contactsTitle: { paddingVertical: theme.spacing.md },
  sectionHeader: { paddingVertical: theme.spacing.xs, backgroundColor: theme.colors.background },
});
