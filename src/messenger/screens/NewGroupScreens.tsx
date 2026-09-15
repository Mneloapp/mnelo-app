import { useMemo, useState } from 'react';
import { Keyboard, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from '@/components/FocusPressable';
import { IconButton, Page, StateView, ui } from '@/components/ui';
import { SearchField } from '@/components/SearchField';
import { theme } from '@/theme/tokens';
import { PeerAvatar } from '../components/ContactCard';
import { PhonebookAccess } from '../components/PhonebookAccess';
import { GroupProfileFields } from '../components/GroupProfileFields';
import { groupProfile } from '../group-profile';
import { useDevice } from '../DeviceProvider';
import { useGroupRecipients } from '../useGroupRecipients';
import { useGroupDraft } from './group-draft';
import { useComposer } from './composer-navigation';
import { usePhoneService } from './phone-shared';
import { useLocalAction } from './shared';
import type { Contact } from '../model';

function HeaderAction({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerAction,
        disabled && styles.disabled,
        pressed && ui.pressed,
      ]}
    >
      <AppText variant="bodyMedium">{label}</AppText>
    </FocusPressable>
  );
}
export function NewGroupScreen() {
  const { t, i18n } = useTranslation();
  const { draft, update } = useGroupDraft();
  const { close } = useComposer();
  const [search, setSearch] = useState('');
  const query = useGroupRecipients(search);
  const sections = useMemo(() => {
    const result: { title: string; data: Contact[] }[] = [];
    for (const item of [...query.matches].sort((a, b) =>
      a.name.localeCompare(b.name, i18n.language),
    )) {
      const title = Array.from(item.name.trim())[0]?.toLocaleUpperCase() || '#';
      const last = result.at(-1);
      if (last?.title === title) last.data.push(item);
      else result.push({ title, data: [item] });
    }
    return result;
  }, [query.matches, i18n.language]);
  function toggle(contact: Contact) {
    const chosen = draft.members.some((item) => item.key === contact.key);
    update({
      members: chosen
        ? draft.members.filter((item) => item.key !== contact.key)
        : [...draft.members, contact].slice(0, 15),
    });
  }
  return (
    <Page nativeHeader scroll={false} contentStyle={ui.flex}>
      <Stack.Screen
        options={{
          title: t('messenger.groupAddMembers'),
          headerLeft: () => <IconButton icon="x" label={t('compose.close')} onPress={close} />,
          headerRight: () => (
            <HeaderAction
              label={t('messenger.groupNext')}
              disabled={!draft.members.length}
              onPress={() => {
                Keyboard.dismiss();
                router.push('/new-group-details');
              }}
            />
          ),
        }}
      />
      <AppText variant="caption" tone="secondary" centered>
        {t('messenger.groupMemberCount', { count: draft.members.length, limit: 15 })}
      </AppText>
      <SearchField label={t('compose.search')} value={search} onChangeText={setSearch} />
      {draft.members.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.selected}
          contentContainerStyle={styles.selectedContent}
          keyboardShouldPersistTaps="handled"
        >
          {draft.members.map((contact) => (
            <FocusPressable
              key={contact.key}
              accessibilityRole="button"
              accessibilityLabel={t('messenger.groupRemoveMember', { name: contact.name })}
              onPress={() => toggle(contact)}
              style={styles.chip}
            >
              <PeerAvatar peer={contact.key} name={contact.name} size="small" />
              <AppText numberOfLines={1} style={styles.chipName}>
                {contact.name}
              </AppText>
              <AppIcon name="x" size={16} />
            </FocusPressable>
          ))}
        </ScrollView>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        style={ui.flex}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        initialNumToRender={15}
        windowSize={7}
        ListHeaderComponent={<PhonebookAccess />}
        renderSectionHeader={({ section }) => (
          <AppText
            variant="label"
            tone="secondary"
            accessibilityRole="header"
            style={styles.section}
          >
            {section.title}
          </AppText>
        )}
        renderItem={({ item, index, section }) => {
          const selected = draft.members.some((contact) => contact.key === item.key);
          const disabled = !selected && draft.members.length >= 15;
          return (
            <FocusPressable
              accessibilityRole="checkbox"
              accessibilityLabel={item.name}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => toggle(item)}
              style={({ pressed }) => [
                styles.member,
                index === 0 && styles.first,
                index === section.data.length - 1 && styles.last,
                pressed && ui.pressed,
              ]}
            >
              <PeerAvatar peer={item.key} name={item.name} />
              <View style={ui.flex}>
                <AppText variant="bodyMedium" numberOfLines={2}>
                  {item.name}
                </AppText>
                {item.phone ? (
                  <AppText variant="caption" tone="secondary">
                    {item.phone}
                  </AppText>
                ) : null}
              </View>
              <AppIcon
                name={selected ? 'check-circle' : 'circle'}
                color={selected ? theme.colors.success : theme.colors.textSecondary}
              />
            </FocusPressable>
          );
        }}
        ListEmptyComponent={
          <StateView
            loading={query.waiting || query.isPending}
            message={t(search ? 'compose.noResults' : 'compose.noContacts')}
            error={query.isError || query.data?.incomplete ? t('phone.failed') : undefined}
            onRetry={() => void query.refetch()}
          />
        }
        ListFooterComponent={
          query.matches.length && query.data?.incomplete ? (
            <StateView error={t('phone.failed')} onRetry={() => void query.refetch()} />
          ) : null
        }
      />
    </Page>
  );
}

export function NewGroupDetailsScreen() {
  const { t } = useTranslation();
  const { engine } = useDevice();
  const { client } = usePhoneService();
  const { finish } = useComposer();
  const { draft, update } = useGroupDraft();
  const action = useLocalAction();
  const [photoBusy, setPhotoBusy] = useState(false);
  const valid = Boolean(
    draft.members.length &&
    draft.members.length <= 15 &&
    draft.name.trim() &&
    groupProfile.safeParse(draft.profile).success,
  );
  async function create() {
    await action.run(async () => {
      const contacts = await engine.contacts();
      for (const selected of draft.members) {
        const saved = contacts.find((contact) => contact.key === selected.key);
        if (saved?.blocked) throw new Error('CONTACT_BLOCKED');
        if (saved) continue;
        if (
          !client ||
          !selected.phone ||
          (await client.execute({ action: 'lookup', phone: selected.phone })).key !== selected.key
        )
          throw new Error('PHONE_IDENTITY_CHANGED');
        await engine.trustPhoneContact({
          key: selected.key,
          name: selected.name,
          phone: selected.phone,
        });
      }
      const id = await engine.createGroup(
        draft.name,
        draft.members.map((contact) => contact.key),
        groupProfile.parse(draft.profile),
      );
      Keyboard.dismiss();
      finish({ pathname: '/chat/[id]', params: { id } });
    });
  }
  return (
    <Page nativeHeader nativeKeyboardInsets contentStyle={styles.details}>
      <Stack.Screen
        options={{
          title: t('messenger.newGroup'),
          headerRight: () => (
            <HeaderAction
              label={t('messenger.createGroup')}
              disabled={!valid || action.busy || photoBusy}
              onPress={() => void create()}
            />
          ),
        }}
      />
      <GroupProfileFields
        name={draft.name}
        onNameChange={(name) => update({ name })}
        profile={draft.profile}
        onChange={(profile) => update({ profile })}
        busy={action.busy}
        onPhotoBusyChange={setPhotoBusy}
      />
      <AppText tone="secondary" variant="label">
        {t('messenger.groupSelectedMembers', { count: draft.members.length })}
      </AppText>
      <View style={styles.summary}>
        {draft.members.map((contact) => (
          <View key={contact.key} style={styles.summaryMember}>
            <PeerAvatar peer={contact.key} name={contact.name} />
            <AppText variant="caption" numberOfLines={2} centered>
              {contact.name}
            </AppText>
          </View>
        ))}
      </View>
      {!groupProfile.safeParse(draft.profile).success ? (
        <AppText accessibilityRole="alert">{t('card.invalidDetails')}</AppText>
      ) : null}
      {action.error ? <AppText accessibilityRole="alert">{action.error}</AppText> : null}
    </Page>
  );
}
const styles = StyleSheet.create({
  headerAction: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
    minHeight: 44,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  selected: { flexGrow: 0, maxHeight: 64 },
  selectedContent: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.pill,
  },
  chipName: { maxWidth: 120 },
  section: {
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    minHeight: 76,
    backgroundColor: theme.colors.surface,
  },
  first: { borderTopLeftRadius: theme.radii.xl, borderTopRightRadius: theme.radii.xl },
  last: { borderBottomLeftRadius: theme.radii.xl, borderBottomRightRadius: theme.radii.xl },
  details: { gap: theme.spacing.lg },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  summaryMember: { width: 76, gap: theme.spacing.xs, alignItems: 'center' },
});
