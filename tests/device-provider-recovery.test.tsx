import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import { AppText } from '@/components/AppText';
import { DeviceProvider, useDevice } from '@/messenger/DeviceProvider';
import { DeviceEnginePool } from '@/messenger/device-engine-pool';
import { emptyProfile } from '@/messenger/local-profile';
import { theme } from '@/theme/tokens';
import type { LocalDatabase } from '@/messenger/model';

type Engine = ReturnType<typeof engine>;
let mockPool: DeviceEnginePool<Engine>;
let mockNetwork = { mesh: null, calls: null, invalid: false, delivery: null };
const mockNetworkObservers = new Set<() => void>();
const mockAcquireNetwork = jest.fn();
const mockFailed = jest.fn();
const mockPhonebook = {
  names: new Map<string, string>(),
  readNames: async () => new Map<string, string>(),
};
jest.mock('@/messenger/device-runtime', () => ({
  acquireDeviceEngine: async () => {
    const lease = await mockPool.acquire();
    return { engine: lease.value, release: lease.release };
  },
  acquireDeviceNetwork: (...args: unknown[]) => mockAcquireNetwork(...args),
  deviceNetworkSnapshot: () => mockNetwork,
  observeDeviceNetwork: (listener: () => void) => {
    mockNetworkObservers.add(listener);
    return () => mockNetworkObservers.delete(listener);
  },
  deviceNetworkFailed: () => mockFailed(),
  deviceEngineRecoverySnapshot: () => mockPool.snapshot(),
  observeDeviceEngineRecovery: (listener: () => void) => mockPool.observe(listener),
  deviceEngineNeedsForeground: () => mockPool.needsForeground(),
}));
jest.mock('@/messenger/enrollment', () => ({
  enrollmentAllowsAccess: (identity: unknown, enrollment: unknown) =>
    Boolean(identity && enrollment),
}));
jest.mock('@/messenger/usePhonebookNames', () => ({ usePhonebookNames: () => mockPhonebook }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);

function engine(database: LocalDatabase, generation: number) {
  return {
    generation,
    currentIdentity: () => ({ key: 'same-owner', name: 'Saved account' }),
    currentEnrollment: () => ({ phone: '+12025550101' }),
    currentProfile: () => emptyProfile,
    subscribe: () => jest.fn(),
    flush: jest.fn(async () => {}),
    close: jest.fn(() => database.close()),
  };
}
function database() {
  let expired = false;
  const observers = new Set<() => void>();
  const formerObservers: (() => void)[] = [];
  const db: LocalDatabase = {
    exec: async () => {},
    run: async () => {},
    all: async () => [],
    close: jest.fn(async () => {}),
    isSuspended: () => expired,
    observeSuspension: (listener) => {
      observers.add(listener);
      formerObservers.push(listener);
      return () => {
        observers.delete(listener);
      };
    },
  };
  return {
    db,
    expire(notify = true) {
      expired = true;
      if (notify) observers.forEach((listener) => listener());
    },
    replayExpiredEvent: () => formerObservers.forEach((listener) => listener()),
  };
}
function Session() {
  const value = useDevice();
  return (
    <>
      <AppText>{value.authenticated ? 'Authenticated session' : 'Unexpected login'}</AppText>
      <AppText>{value.identity?.key ?? 'Missing account'}</AppText>
      <AppText>{'Engine ' + (value.engine as unknown as Engine).generation}</AppText>
    </>
  );
}
const appListeners = new Set<(state: AppStateStatus) => void>();
async function appState(state: AppStateStatus) {
  await act(async () => {
    AppState.currentState = state;
    appListeners.forEach((listener) => listener(state));
  });
}
beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  appListeners.clear();
  mockNetworkObservers.clear();
  mockNetwork = { mesh: null, calls: null, invalid: false, delivery: null };
  mockAcquireNetwork.mockReset().mockImplementation(() => ({ release: jest.fn() }));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appListeners.add(listener);
    return {
      remove: () => {
        appListeners.delete(listener);
      },
    };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function fixture(options: { openingSuspensions?: number; ready?: boolean } = {}) {
  const databases = [database(), database()];
  const engines: Engine[] = [];
  let remaining = options.openingSuspensions ?? 0;
  const open = jest.fn(async () => {
    if (remaining > 0) {
      remaining--;
      throw new Error('DATABASE_SUSPENDED');
    }
    return databases[engines.length]!.db;
  });
  mockPool = new DeviceEnginePool(
    open,
    async (db) => {
      const value = engine(db, engines.length + 1);
      engines.push(value);
      return value;
    },
    (value) => value.close(),
    () => {
      mockNetwork = { mesh: null, calls: null, invalid: false, delivery: null };
      mockNetworkObservers.forEach((listener) => listener());
    },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cancel = jest.spyOn(client, 'cancelQueries');
  const remove = jest.spyOn(client, 'removeQueries');
  const rendered = await render(
    <QueryClientProvider client={client}>
      <DeviceProvider>
        <Session />
      </DeviceProvider>
    </QueryClientProvider>,
  );
  await act(async () => jest.advanceTimersByTime(theme.motion.welcomeMinimumMs));
  if (options.ready !== false) expect(screen.getByText('Engine 1')).toBeOnTheScreen();
  return {
    databases,
    engines,
    open,
    client,
    cancel,
    remove,
    async close() {
      await rendered.unmount();
      client.clear();
    },
  };
}

test('background expiration waits for foreground and reopens the same account without an error or login screen', async () => {
  const f = await fixture();
  try {
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
    await appState('background');
    await act(async () => f.databases[0]!.expire());
    expect(screen.queryByText('Unexpected login')).toBeNull();
    expect(screen.queryByText('Missing account')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
    expect(f.open).toHaveBeenCalledTimes(1);
    expect(mockFailed).not.toHaveBeenCalled();
    expect(f.cancel).toHaveBeenCalledWith({ queryKey: ['device'] });
    expect(f.remove).toHaveBeenCalledWith({ queryKey: ['device'] });
    await appState('active');
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Engine 2')).toBeOnTheScreen();
    expect(screen.getByText('same-owner')).toBeOnTheScreen();
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
    expect(mockAcquireNetwork).toHaveBeenCalledTimes(2);
    expect(mockAcquireNetwork.mock.calls[1]![0]).toBe(f.engines[1]);
    await act(async () => f.databases[0]!.replayExpiredEvent());
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Engine 2')).toBeOnTheScreen();
    expect(f.engines[1]!.close).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

test('foreground detects an expired native token before flushing when its suspension event was missed', async () => {
  const f = await fixture();
  try {
    await appState('background');
    f.databases[0]!.expire(false);
    expect(f.open).toHaveBeenCalledTimes(1);
    expect(mockPool.snapshot()).toBe(0);
    await appState('active');
    expect(f.engines[0]!.flush).not.toHaveBeenCalled();
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Engine 2')).toBeOnTheScreen();
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
    expect(mockFailed).not.toHaveBeenCalled();
    await appState('active');
    expect(f.engines[1]!.flush).toHaveBeenCalledTimes(1);
    expect(f.engines[0]!.flush).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

test('a genuine reopen failure offers retry instead of hiding forever behind suspension recovery', async () => {
  const f = await fixture();
  try {
    await appState('background');
    await act(async () => f.databases[0]!.expire());
    f.open.mockRejectedValueOnce(new Error('FIXTURE_REOPEN_FAILED'));
    await appState('active');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(screen.queryByText('Unexpected login')).toBeNull();
    expect(f.open).toHaveBeenCalledTimes(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Engine 2')).toBeOnTheScreen();
    expect(screen.getByText('same-owner')).toBeOnTheScreen();
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
    expect(f.open).toHaveBeenCalledTimes(3);
  } finally {
    await f.close();
  }
});

test('a cold background open suspended before its listener exists waits for foreground without retrying or losing the account', async () => {
  AppState.currentState = 'background';
  const f = await fixture({ openingSuspensions: 1, ready: false });
  try {
    expect(mockPool.needsForeground()).toBe(true);
    expect(f.open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await act(async () => jest.advanceTimersByTimeAsync(5000));
    expect(f.open).toHaveBeenCalledTimes(1);
    await appState('active');
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Engine 1')).toBeOnTheScreen();
    expect(screen.getByText('same-owner')).toBeOnTheScreen();
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
  } finally {
    await f.close();
  }
});

test('a transient cold foreground opening suspension recovers without a new AppState event', async () => {
  const f = await fixture({ openingSuspensions: 1 });
  try {
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Engine 1')).toBeOnTheScreen();
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  } finally {
    await f.close();
  }
});

test('repeated native open suspensions have a bounded foreground retry budget and an explicit working Retry', async () => {
  const f = await fixture({ openingSuspensions: Infinity, ready: false });
  try {
    await act(async () => jest.advanceTimersByTimeAsync(2000));
    expect(f.open).toHaveBeenCalledTimes(4); // Initial open and at most three recovery attempts.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(mockAcquireNetwork).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTimeAsync(30000));
    expect(f.open).toHaveBeenCalledTimes(4);
    f.open.mockResolvedValueOnce(f.databases[0]!.db);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(f.open).toHaveBeenCalledTimes(5);
    expect(screen.getByText('Engine 1')).toBeOnTheScreen();
    expect(screen.getByText('same-owner')).toBeOnTheScreen();
    expect(screen.getByText('Authenticated session')).toBeOnTheScreen();
  } finally {
    await f.close();
  }
});
