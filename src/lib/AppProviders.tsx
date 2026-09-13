import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { createQueryClient } from './query-client';
import { hasConnection } from './connectivity';
import { i18n } from '@/i18n';
import { usePreferences } from '@/stores/preferences';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  const locale = usePreferences((state) => state.locale);

  useEffect(() => {
    void usePreferences.getState().restore();
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined')
      document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale]);
  useEffect(() => {
    const focus = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    // Observe connection state without a third-party reachability ping. Service errors are handled separately.
    NetInfo.configure({ useNativeReachability: true, reachabilityShouldRun: () => false });
    const unsubscribe = NetInfo.addEventListener((state) =>
      onlineManager.setOnline(hasConnection(state)),
    );
    return () => {
      focus.remove();
      unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
