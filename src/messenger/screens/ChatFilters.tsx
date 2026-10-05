import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FocusPressable } from '@/components/FocusPressable';
import { AppText } from '@/components/AppText';
import { theme } from '@/theme/tokens';
import type { ChatFilter } from '../engine';
const options = {
  all: 'messenger.filterAll',
  unread: 'messenger.filterUnread',
  direct: 'messenger.filterDirect',
  group: 'messenger.filterGroups',
} as const;
export function ChatFilters({
  value,
  onChange,
}: {
  value: ChatFilter;
  onChange: (filter: ChatFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      accessibilityRole="tablist"
      accessibilityLabel={t('tabs.chats')}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.filters}
      keyboardShouldPersistTaps="handled"
    >
      {(Object.keys(options) as ChatFilter[]).map((filter) => (
        <FocusPressable
          key={filter}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === filter }}
          aria-selected={value === filter}
          onPress={() => onChange(filter)}
          style={[styles.filter, value === filter && styles.selected]}
        >
          <AppText variant="label" style={[styles.text, value === filter && styles.selectedText]}>
            {t(options[filter])}
          </AppText>
        </FocusPressable>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  strip: { flexGrow: 0, flexShrink: 0 },
  filters: { gap: theme.spacing.lg, paddingVertical: theme.spacing.xs },
  filter: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    minHeight: theme.controls.minTapTarget,
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  selected: { borderBottomColor: theme.colors.black },
  text: { color: theme.colors.textSecondary },
  selectedText: { color: theme.colors.textPrimary },
});
