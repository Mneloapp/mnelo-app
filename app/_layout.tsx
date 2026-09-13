import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '@/lib/AppProviders';
import { TypographyProvider } from '@/theme/fonts';
import { theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DeviceProvider, useDevice } from '@/messenger/DeviceProvider';
import { IncomingCalls } from '@/messenger/screens/CallScreen';
import { IncomingShares } from '@/messenger/components/IncomingShares';
import { DeviceNotifications } from '@/messenger/DeviceNotifications';
export { RouteError as ErrorBoundary } from '@/components/RouteError';
function Navigator() {
  const { identity, authenticated } = useDevice();
  const reducedMotion = useReducedMotion();
  return (
    <>
      {authenticated && <IncomingCalls />}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reducedMotion ? 'none' : 'default',
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="identity" />
        <Stack.Screen name="contact-invite" />
        <Stack.Protected guard={!identity}>
          <Stack.Screen name="restore" />
        </Stack.Protected>
        <Stack.Protected guard={authenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(compose)" options={{ presentation: 'card' }} />
          <Stack.Screen name="phone" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="call/[id]" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="edit-profile-field" />
          <Stack.Screen name="contact/[key]" />
          <Stack.Screen name="shared/[id]" />
          <Stack.Screen name="privacy" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="account" />
          <Stack.Screen name="open-source" />
          <Stack.Screen name="blocked" />
          <Stack.Screen name="backups" />
        </Stack.Protected>
      </Stack>
      <DeviceNotifications />
      <IncomingShares />
    </>
  );
}
export default function RootLayout() {
  return (
    <AppProviders>
      <TypographyProvider>
        <StatusBar style="dark" />
        <DeviceProvider>
          <Navigator />
        </DeviceProvider>
      </TypographyProvider>
    </AppProviders>
  );
}
