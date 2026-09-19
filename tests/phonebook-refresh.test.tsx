import { StrictMode, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppText } from '@/components/AppText';
import { PHONEBOOK_INITIAL_WAIT_MS, usePhonebookNames } from '@/messenger/usePhonebookNames';
import { ContactView } from '@/messenger/contact-view';
import { phonebookChanged } from '@/messenger/phonebook-events';
import type { DeviceMessenger } from '@/messenger/engine';
const mockRead = jest.fn(async () => new Map([['+12025550101', 'Local name']]));
let mockNativeChanged = () => {};
const mockNativeRemove = jest.fn();
jest.mock('@/messenger/phonebook', () => ({
  savedPhoneNames: (...args: unknown[]) => mockRead(...(args as [])),
  observeNativePhonebook: (listener: () => void) => {
    mockNativeChanged = listener;
    return mockNativeRemove;
  },
}));
let changed = () => {};
const unsubscribe = jest.fn();
const engine = {
  contacts: async () => [
    { key: 'peer', name: 'Saved alias', phone: '+12025550101', blocked: false },
  ],
  subscribe: (callback: () => void) => {
    changed = callback;
    return unsubscribe;
  },
  contactDisplayNames: async () => new Map([['peer', 'Registered name']]),
  chat: async () => ({ id: 'chat', kind: 'direct', peer: 'peer', title: 'Saved alias' }),
} as unknown as DeviceMessenger;
beforeEach(() => {
  mockRead.mockReset().mockResolvedValue(new Map([['+12025550101', 'Local name']]));
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());
function Names({ enabled = true }: { enabled?: boolean }) {
  const { names } = usePhonebookNames(engine, enabled, '+12025550102');
  return <AppText>{names.get('peer') ?? 'Saved alias'}</AppText>;
}
test('existing contacts refresh on resume/permission changes, not every message; access removal clears only the projection', async () => {
  let foreground: (state: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  const listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    foreground = listener;
    return { remove };
  });
  const result = await render(<Names />);
  await screen.findByText('Local name');
  expect(mockRead).toHaveBeenCalledTimes(1);
  await act(async () => {
    changed();
  });
  expect(mockRead).toHaveBeenCalledTimes(1);
  mockRead.mockResolvedValueOnce(new Map([['+12025550101', 'Renamed in Contacts']]));
  await act(async () => {
    mockNativeChanged();
  });
  await screen.findByText('Renamed in Contacts');
  mockRead.mockResolvedValueOnce(new Map([['+12025550101', 'Name after returning']]));
  await act(async () => {
    foreground('active');
  });
  await screen.findByText('Name after returning');
  mockRead.mockResolvedValueOnce(new Map());
  await act(async () => {
    phonebookChanged();
  });
  await screen.findByText('Saved alias');
  expect(mockRead).toHaveBeenCalledTimes(4);
  await result.rerender(<Names enabled={false} />);
  expect(screen.getByText('Saved alias')).toBeOnTheScreen();
  await result.unmount();
  await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  expect(remove).toHaveBeenCalled();
  expect(mockNativeRemove).toHaveBeenCalled();
  listen.mockRestore();
});

test('a native contact change queued during a failed read is still applied without restarting the app', async () => {
  const listen = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  let failRead = (_error: Error) => {};
  mockRead.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        failRead = reject;
      }),
  );
  const result = await render(<Names />);
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));
  mockRead.mockResolvedValueOnce(new Map([['+12025550101', 'Recovered contact name']]));
  await act(async () => {
    mockNativeChanged();
    failRead(new Error('Contacts temporarily unavailable'));
  });
  await screen.findByText('Recovered contact name');
  expect(mockRead).toHaveBeenCalledTimes(2);
  await result.unmount();
  listen.mockRestore();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let currentNames!: ReturnType<typeof usePhonebookNames>;
function NameQuery({
  enabled = true,
  device = engine,
  number = '+12025550102',
}: {
  enabled?: boolean;
  device?: DeviceMessenger;
  number?: string;
}) {
  const source = usePhonebookNames(device, enabled, number);
  const [resolved, setResolved] = useState<{ source: typeof source; title: string } | null>(null);
  useEffect(() => {
    currentNames = source;
    let alive = true;
    void new ContactView(device, source.readNames).chat('chat').then((chat) => {
      if (alive) setResolved({ source, title: chat?.title ?? 'Missing' });
    });
    return () => {
      alive = false;
    };
  }, [device, source]);
  return <AppText>{resolved?.source === source ? resolved.title : 'Resolving'}</AppText>;
}

test('the first chat query waits for Contacts and renders the local name without the profile-name flash', async () => {
  const read = deferred<Map<string, string>>();
  mockRead.mockReturnValueOnce(read.promise);
  const result = await render(<NameQuery />);
  expect(screen.getByText('Resolving')).toBeOnTheScreen();
  expect(screen.queryByText('Registered name')).not.toBeOnTheScreen();
  const pending = currentNames.readNames();
  await act(async () => {
    read.resolve(new Map([['+12025550101', 'First local name']]));
  });
  expect((await pending).get('peer')).toBe('First local name');
  await screen.findByText('First local name');
  const stable = currentNames;
  await result.rerender(<NameQuery />);
  expect(currentNames).toBe(stable);
  await result.unmount();
});

test('effect replay keeps the current first-name query pending until its Contacts read resolves', async () => {
  const read = deferred<Map<string, string>>();
  mockRead.mockImplementation(() => read.promise);
  const result = await render(
    <StrictMode>
      <NameQuery />
    </StrictMode>,
  );
  expect(screen.getByText('Resolving')).toBeOnTheScreen();
  await act(async () => {
    read.resolve(new Map([['+12025550101', 'Replay local name']]));
  });
  await screen.findByText('Replay local name');
  await result.unmount();
});

test.each(['denied', 'failed'])(
  'initial %s read releases name queries to their local profile fallback',
  async (mode) => {
    if (mode === 'denied') mockRead.mockResolvedValueOnce(new Map());
    else mockRead.mockRejectedValueOnce(new Error('Contacts unavailable'));
    const result = await render(<NameQuery />);
    await screen.findByText('Registered name');
    expect((await currentNames.readNames()).size).toBe(0);
    await result.unmount();
  },
);

test('a Contacts change during the first scan prevents publishing an obsolete name', async () => {
  const first = deferred<Map<string, string>>();
  const fresh = deferred<Map<string, string>>();
  mockRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(fresh.promise);
  const result = await render(<NameQuery />);
  await act(async () => {
    mockNativeChanged();
    first.resolve(new Map([['+12025550101', 'Obsolete name']]));
  });
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Resolving')).toBeOnTheScreen();
  expect(screen.queryByText('Obsolete name')).not.toBeOnTheScreen();
  await act(async () => {
    fresh.resolve(new Map([['+12025550101', 'Fresh name']]));
  });
  await screen.findByText('Fresh name');
  await result.unmount();
});

test('disable and re-enable isolate pending readers and ignore a prior session completing late', async () => {
  const old = deferred<Map<string, string>>();
  const fresh = deferred<Map<string, string>>();
  mockRead.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const result = await render(<NameQuery />);
  const pendingOld = currentNames.readNames();
  await result.rerender(<NameQuery enabled={false} />);
  expect((await pendingOld).size).toBe(0);
  await result.rerender(<NameQuery />);
  const pendingNew = currentNames.readNames();
  await act(async () => {
    old.resolve(new Map([['+12025550101', 'Old session name']]));
  });
  expect(screen.getByText('Resolving')).toBeOnTheScreen();
  expect(currentNames.names.size).toBe(0);
  await act(async () => {
    fresh.resolve(new Map([['+12025550101', 'New session name']]));
  });
  expect((await pendingNew).get('peer')).toBe('New session name');
  await screen.findByText('New session name');
  await result.unmount();
});

test.each(['engine', 'number'])(
  'changing the %s scope discards resolved names until a new read finishes',
  async (scope) => {
    const result = await render(<NameQuery />);
    await screen.findByText('Local name');
    const oldSource = currentNames;
    const fresh = deferred<Map<string, string>>();
    mockRead.mockReturnValueOnce(fresh.promise);
    await result.rerender(
      <NameQuery
        device={scope === 'engine' ? Object.create(engine) : engine}
        number={scope === 'number' ? '+442079460123' : '+12025550102'}
      />,
    );
    expect((await oldSource.readNames()).size).toBe(0);
    expect(currentNames.names.size).toBe(0);
    expect(screen.getByText('Resolving')).toBeOnTheScreen();
    await act(async () => {
      fresh.resolve(new Map([['+12025550101', 'New scope name']]));
    });
    await screen.findByText('New scope name');
    await result.unmount();
  },
);

test('hung native reads time out, late success refreshes, and unmount releases waiting queries', async () => {
  jest.useFakeTimers();
  try {
    const read = deferred<Map<string, string>>();
    mockRead.mockReturnValueOnce(read.promise);
    const result = await render(<NameQuery />);
    const pending = currentNames.readNames();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(PHONEBOOK_INITIAL_WAIT_MS - 1);
    });
    expect(screen.getByText('Resolving')).toBeOnTheScreen();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect((await pending).size).toBe(0);
    expect(screen.getByText('Registered name')).toBeOnTheScreen();
    await act(async () => {
      read.resolve(new Map([['+12025550101', 'Late local name']]));
    });
    expect(screen.getByText('Late local name')).toBeOnTheScreen();
    await result.unmount();

    mockRead.mockReturnValueOnce(new Promise(() => {}));
    const removed = await render(<NameQuery />);
    const abandoned = currentNames.readNames();
    await removed.unmount();
    expect((await abandoned).size).toBe(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});
