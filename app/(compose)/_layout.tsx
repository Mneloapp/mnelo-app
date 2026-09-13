import { useState } from 'react';
import { Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { useAppFont } from '@/theme/fonts';
import { theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ComposerContext, composerNavigation } from '@/messenger/screens/composer-navigation';

export default function ComposeLayout() {
  const segments = useSegments();
  const { from } = useGlobalSearchParams<{ from?: string }>();
  const [navigation] = useState(() =>
    composerNavigation(
      segments.some((segment) => segment === 'new-call' || segment === 'dial-number')
        ? 'calls'
        : from === 'me'
          ? 'me'
          : 'chats',
    ),
  );
  const { t } = useTranslation();
  const font = useAppFont('600');
  const reduced = useReducedMotion();
  return (
    <ComposerContext value={navigation}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { ...theme.typography.headline, ...font },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () => (
            <IconButton icon="x" label={t('compose.close')} onPress={navigation.close} />
          ),
          contentStyle: { backgroundColor: theme.colors.background },
          animation: reduced ? 'none' : 'default',
        }}
      >
        <Stack.Screen name="new-message" options={{ title: t('compose.newChat') }} />
        <Stack.Screen name="new-call" options={{ title: t('messenger.newCall') }} />
        <Stack.Screen name="new-contact" options={{ title: t('compose.newContact') }} />
        <Stack.Screen name="contact-code" options={{ title: t('messenger.contactCode') }} />
        <Stack.Screen name="my-code" options={{ title: t('messenger.myCode') }} />
        <Stack.Screen name="scan-contact" options={{ title: t('card.scan') }} />
        <Stack.Screen name="find-phone" options={{ title: t('phone.search') }} />
        <Stack.Screen name="dial-number" options={{ title: t('compose.keypad') }} />
        <Stack.Screen name="new-group" options={{ title: t('messenger.newGroup') }} />
      </Stack>
    </ComposerContext>
  );
}
