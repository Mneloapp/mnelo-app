import { countryName } from '@/i18n/format';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import { useTranslation } from 'react-i18next';
import { Field, IconButton, Page, Row, StateView } from '@/components/ui';
import { AppIcon } from '@/components/AppIcon';
import { FocusPressable } from './FocusPressable';
import { AppText } from './AppText';
import { theme } from '@/theme/tokens';
export function CountryPicker({
  value,
  onChange,
  disabled = false,
  inline = false,
}: {
  value: CountryCode;
  onChange: (value: CountryCode) => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  const reduced = useReducedMotion();
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const countries = useMemo(() => {
    return getCountries()
      .map((code) => ({
        code,
        name: countryName(code, i18n.language),
        dial: '+' + getCountryCallingCode(code),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [i18n.language]);
  const selected = countries.find((c) => c.code === value);
  const matches = countries.filter((c) =>
    (c.name + ' ' + c.dial + ' ' + c.code)
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  function open() {
    Keyboard.dismiss();
    setSearch('');
    setVisible(true);
  }
  return (
    <>
      {inline ? (
        <FocusPressable
          accessibilityRole="button"
          accessibilityLabel={
            t('auth.country') + '. ' + (selected?.name ?? value) + ' ' + (selected?.dial ?? '')
          }
          accessibilityState={{ disabled, expanded: visible }}
          disabled={disabled}
          onPress={open}
          style={({ pressed }) => [styles.inline, pressed && styles.pressed]}
        >
          <AppText>{selected?.dial}</AppText>
          <AppIcon name="chevron-down" size={theme.icons.sm} />
        </FocusPressable>
      ) : (
        <Row
          title={t('auth.country')}
          subtitle={(selected?.name ?? value) + ' ' + (selected?.dial ?? '')}
          right={<AppIcon name="chevron-down" />}
          disabled={disabled}
          onPress={open}
        />
      )}
      <Modal
        visible={visible}
        accessibilityLabel={t('auth.country')}
        accessibilityViewIsModal
        animationType={reduced ? 'none' : 'slide'}
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaProvider onAccessibilityEscape={() => setVisible(false)}>
          <Page
            title={t('auth.country')}
            scroll={false}
            right={
              <IconButton label={t('common.cancel')} icon="x" onPress={() => setVisible(false)} />
            }
          >
            <Field
              label={t('common.search')}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <FlatList
              data={matches}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={15}
              ListEmptyComponent={<StateView message={t('auth.noCountriesFound')} />}
              renderItem={({ item: c }) => (
                <Row
                  title={c.name}
                  subtitle={c.dial}
                  selected={c.code === value}
                  right={c.code === value ? <AppIcon name="check" /> : undefined}
                  onPress={() => {
                    onChange(c.code);
                    setSearch('');
                    setVisible(false);
                  }}
                />
              )}
            />
          </Page>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'stretch',
    minHeight: theme.controls.minTapTarget,
    paddingHorizontal: theme.spacing.md,
  },
  pressed: { opacity: theme.opacity.pressed },
});
