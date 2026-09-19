import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page, StateView } from '@/components/ui';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { theme } from '@/theme/tokens';
import { ContactView } from './contact-view';
import { cleanupChatExports } from './chat-export-cache';
import { usePhonebookNames } from './usePhonebookNames';
import { DeviceMessenger } from './engine';
import { PeerMesh } from './peer-mesh';
import { DeviceCalls } from './calls';
import type { DeliveryState } from './delivery/pump';
import { enrollmentAllowsAccess, type PhoneEnrollment } from './enrollment';
import { emptyProfile, type LocalProfile } from './local-profile';
import {
  acquireDeviceEngine,
  acquireDeviceNetwork,
  deviceNetworkSnapshot,
  observeDeviceNetwork,
  deviceNetworkFailed,
  deviceEngineRecoverySnapshot,
  observeDeviceEngineRecovery,
  deviceEngineNeedsForeground,
} from './device-runtime';

type Context = {
  engine: DeviceMessenger;
  view: ContactView;
  identity: { key: string; name: string } | null;
  mesh: PeerMesh | null;
  calls: DeviceCalls | null;
  revision: number;
  authenticated: boolean;
  enrollment: PhoneEnrollment | null;
  profile: LocalProfile;
  deliveryState: DeliveryState | null;
};
const DeviceContext = createContext<Context | null>(null);
export function useDevice() {
  const value = useContext(DeviceContext);
  if (!value) throw new Error('DEVICE_NOT_READY');
  return value;
}
export function DeviceProvider({ children }: PropsWithChildren) {
  const [engine, setEngine] = useState<DeviceMessenger | null>(null);
  const [welcomeFinished, setWelcomeFinished] = useState(false);
  const [identity, setIdentity] = useState<Context['identity']>(null);
  const [enrollment, setEnrollment] = useState<PhoneEnrollment | null>(null);
  const [profile, setProfile] = useState<LocalProfile>(emptyProfile);
  const authenticated = enrollmentAllowsAccess(
    identity,
    enrollment,
    process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
    process.env.EXPO_PUBLIC_APP_ENV,
  );
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const recoveryAttempts = useRef(0);
  const cache = useQueryClient();
  const { t } = useTranslation();
  const recovery = useSyncExternalStore(
    observeDeviceEngineRecovery,
    deviceEngineRecoverySnapshot,
    deviceEngineRecoverySnapshot,
  );
  useEffect(() => {
    cleanupChatExports();
    const timer = setTimeout(() => setWelcomeFinished(true), theme.motion.welcomeMinimumMs);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    let alive = true;
    let current: DeviceMessenger | undefined;
    let release: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      if (deviceEngineNeedsForeground()) {
        await cache.cancelQueries({ queryKey: ['device'] });
        if (!alive) return;
        setEngine(null);
        setError(false);
        cache.removeQueries({ queryKey: ['device'] });
        if (AppState.currentState !== 'active') return;
        if (recoveryAttempts.current >= 3) {
          setError(true);
          return;
        }
        recoveryAttempts.current++;
      }
      const lease = await acquireDeviceEngine();
      current = lease.engine;
      release = lease.release;
      const next = current.currentIdentity();
      if (!alive) {
        release();
        return;
      }
      recoveryAttempts.current = 0;
      setEngine(current);
      setIdentity(next ? { key: next.key, name: next.name } : null);
      setEnrollment(current.currentEnrollment());
      setProfile(current.currentProfile());
      unsubscribe = current.subscribe(() => {
        const next = current?.currentIdentity();
        setEnrollment(current?.currentEnrollment() ?? null);
        if (current) setProfile(current.currentProfile());
        setIdentity((previous) =>
          previous?.key === next?.key && previous?.name === next?.name
            ? previous
            : next
              ? { key: next.key, name: next.name }
              : null,
        );
        void cache.invalidateQueries({ queryKey: ['device'] });
      });
    })().catch((error: unknown) => {
      const suspended = error instanceof Error && error.message === 'DATABASE_SUSPENDED';
      if (!alive) return;
      if (!suspended) setError(true);
      else if (AppState.currentState === 'active') {
        if (recoveryAttempts.current >= 3) setError(true);
        else
          retryTimer = setTimeout(() => {
            if (alive && AppState.currentState === 'active') setAttempt((value) => value + 1);
          }, 250);
      }
    });
    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe?.();
      release?.();
    };
  }, [attempt, cache, recovery]);
  useEffect(() => {
    // A reopened database (including Fast Refresh) has a new engine. Cached
    // queries may still hold an error from the old, already closed connection.
    if (engine) void cache.invalidateQueries({ queryKey: ['device'] });
  }, [engine, cache]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && deviceEngineNeedsForeground()) {
        recoveryAttempts.current = 0;
        setAttempt((value) => value + 1);
      } else if (state === 'active' && engine) {
        void cache.invalidateQueries({ queryKey: ['device'] });
        void engine.flush().catch(() => undefined);
      }
    });
    return () => listener.remove();
  }, [engine, cache]);
  const runtime = useSyncExternalStore(
    observeDeviceNetwork,
    deviceNetworkSnapshot,
    deviceNetworkSnapshot,
  );
  useEffect(() => {
    if (!engine || !authenticated) return;
    try {
      const lease = acquireDeviceNetwork(engine, () => setRevision((value) => value + 1));
      return () => lease?.release();
    } catch {
      deviceNetworkFailed();
    }
  }, [engine, identity?.key, authenticated]);
  const phonebook = usePhonebookNames(engine, authenticated, enrollment?.phone);
  const contactView = useMemo(
    () => (engine ? new ContactView(engine, phonebook.readNames) : null),
    [engine, phonebook],
  );
  useEffect(() => {
    if (contactView) void cache.invalidateQueries({ queryKey: ['device'] });
  }, [contactView, cache]);
  if (error || runtime.invalid)
    return (
      <Page>
        <StateView
          error={t('messenger.deviceUnavailable')}
          onRetry={() => {
            recoveryAttempts.current = 0;
            setError(false);
            setEngine(null);
            setAttempt((value) => value + 1);
          }}
        />
      </Page>
    );
  if (!engine || !contactView || !welcomeFinished) return <WelcomeScreen />;
  return (
    <DeviceContext.Provider
      value={{
        engine,
        view: contactView,
        identity,
        mesh: runtime.mesh,
        calls: runtime.calls,
        revision,
        authenticated,
        enrollment,
        profile,
        deliveryState: runtime.delivery,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}
