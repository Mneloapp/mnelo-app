import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page, StateView } from '@/components/ui';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { theme } from '@/theme/tokens';
import { ContactView } from './contact-view';
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
  const cache = useQueryClient();
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(() => setWelcomeFinished(true), theme.motion.welcomeMinimumMs);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    let alive = true;
    let current: DeviceMessenger | undefined;
    let release: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const lease = await acquireDeviceEngine();
      current = lease.engine;
      release = lease.release;
      const next = current.currentIdentity();
      if (!alive) {
        release();
        return;
      }
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
    })().catch(() => {
      if (alive) setError(true);
    });
    return () => {
      alive = false;
      unsubscribe?.();
      release?.();
    };
  }, [attempt, cache]);
  useEffect(() => {
    // A reopened database (including Fast Refresh) has a new engine. Cached
    // queries may still hold an error from the old, already closed connection.
    if (engine) void cache.invalidateQueries({ queryKey: ['device'] });
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
  const phoneNames = usePhonebookNames(engine, authenticated, enrollment?.phone);
  const contactView = useMemo(
    () => (engine ? new ContactView(engine, phoneNames) : null),
    [engine, phoneNames],
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
