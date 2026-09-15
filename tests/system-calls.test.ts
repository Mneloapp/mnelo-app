import { AppState } from 'react-native';
import { observeSystemCalls } from '@/messenger/system-calls.native';
import type { DeviceCalls, DeviceCall, CallControl } from '@/messenger/calls';
import type { PhoneClient } from '@/messenger/phone-client';
import { retryBackground, backgroundSnapshot } from '@/messenger/background-status';

jest.mock('expo-modules-core', () => {
  const native = {
    changed: () => {},
    state: jest.fn(async () => ({ environment: 'sandbox', voipToken: 'a'.repeat(64) })),
    drain: jest.fn(async (): Promise<unknown[]> => []),
    incoming: jest.fn(async () => {}),
    outgoing: jest.fn(async () => {}),
    answer: jest.fn(async () => {}),
    connected: jest.fn(async () => {}),
    ringback: jest.fn(async () => {}),
    identify: jest.fn(async () => {}),
    end: jest.fn(async () => {}),
    addListener: jest.fn((_name: string, fn: () => void) => {
      native.changed = fn;
      return { remove: jest.fn() };
    }),
  };
  return {
    ...jest.requireActual('expo-modules-core'),
    requireOptionalNativeModule: () => native,
    __native: native,
  };
});
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getDevicePushTokenAsync: async () => ({ type: 'ios', data: 'b'.repeat(64) }),
  addPushTokenListener: () => ({ remove: jest.fn() }),
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));
const native = jest.requireMock('expo-modules-core').__native;
const notifications = jest.requireMock('expo-notifications');
const id = 'b9870ee4-4c80-4bb3-9b52-a9c77f905b9a';
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function fixture(
  execute = jest.fn(async () => ({ ok: true })),
  caller?: (call: DeviceCall) => Promise<{ name: string; phone: string } | null>,
) {
  let value: DeviceCall | null = null;
  let changed = () => {};
  let control = (_value: CallControl) => {};
  const calls = {
    snapshot: () => value,
    subscribe: (fn: () => void) => {
      changed = fn;
      return () => {};
    },
    observeControl: (fn: typeof control) => {
      control = fn;
      return () => {};
    },
    accept: jest.fn(async () => {
      value = { ...value!, status: 'connecting' };
      changed();
    }),
    end: jest.fn(async () => {
      value = { ...value!, status: 'ended' };
      changed();
    }),
    mute: jest.fn(),
  };
  const stop = observeSystemCalls(
    calls as unknown as DeviceCalls,
    { execute } as unknown as PhoneClient,
    caller,
  );
  const update = (
    status: DeviceCall['status'],
    media: DeviceCall['media'] = 'voice',
    incoming = true,
  ) => {
    value = { id, incoming, media, status, local: {} } as DeviceCall;
    changed();
  };
  return {
    calls,
    stop,
    update,
    control: (action: 'end' | 'decline') => control({ id, type: 'call', action, media: 'voice' }),
    execute,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  native.drain.mockReset().mockResolvedValue([]);
  notifications.getPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
});

test('first alert approval during VoIP registration is registered without reopening the app', async () => {
  let finish!: (value: { ok: boolean }) => void;
  const execute = jest
    .fn(async () => ({ ok: true }))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  notifications.getPermissionsAsync.mockResolvedValueOnce({ granted: false });
  const f = fixture(execute);
  try {
    await tick();
    const pending = retryBackground();
    finish({ ok: true });
    await pending;
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'push-register',
        registration: expect.objectContaining({ channel: 'alert' }),
      }),
    );
    expect(backgroundSnapshot()).toBe('ready');
  } finally {
    f.stop();
  }
});

test('provisional iOS approval registers alerts consistently with permission settings', async () => {
  notifications.getPermissionsAsync.mockResolvedValue({ granted: false, ios: { status: 3 } });
  const f = fixture();
  try {
    await tick();
    expect(f.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        registration: expect.objectContaining({ channel: 'alert' }),
      }),
    );
    expect(backgroundSnapshot()).toBe('ready');
  } finally {
    f.stop();
  }
});
test('cold incoming and early native answer wait for the authenticated peer invite', async () => {
  const f = fixture();
  try {
    await tick();
    native.drain.mockResolvedValueOnce([
      { type: 'incoming', id, video: false },
      { type: 'answer', id },
    ]);
    native.changed();
    await tick();
    expect(f.calls.accept).not.toHaveBeenCalled();
    expect(native.end).not.toHaveBeenCalled();
    f.update('incoming');
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
    expect(native.answer).not.toHaveBeenCalled();
    f.update('active');
    await tick();
    expect(native.connected).toHaveBeenCalledWith(id);
  } finally {
    f.stop();
  }
});
test('a native decline before rendezvous rejects a late authenticated invite', async () => {
  const f = fixture();
  try {
    await tick();
    native.drain.mockResolvedValueOnce([{ type: 'end', id }]);
    native.changed();
    await tick();
    f.update('incoming');
    await tick();
    expect(f.calls.end).toHaveBeenCalledWith(false, true, 'local');
    expect(f.calls.accept).not.toHaveBeenCalled();
    expect(native.incoming).not.toHaveBeenCalled();
  } finally {
    f.stop();
  }
});
test('answer in the app activates the native call audio path exactly once', async () => {
  const f = fixture();
  try {
    await tick();
    f.update('incoming');
    await tick();
    f.update('connecting');
    await tick();
    f.update('active');
    await tick();
    expect(native.answer).toHaveBeenCalledTimes(1);
    expect(native.answer).toHaveBeenCalledWith(id);
  } finally {
    f.stop();
  }
});
test('a native event arriving during an asynchronous drain is not dropped', async () => {
  const f = fixture();
  try {
    await tick();
    let finish!: (events: unknown[]) => void;
    native.drain.mockImplementationOnce(
      () =>
        new Promise<unknown[]>((resolve) => {
          finish = resolve;
        }),
    );
    native.changed();
    native.drain.mockResolvedValueOnce([{ type: 'answer', id }]);
    native.changed();
    finish([{ type: 'incoming', id, video: false }]);
    await tick();
    f.update('incoming');
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
  } finally {
    f.stop();
  }
});
test('authenticated remote cancellation ends a native call even before its peer invite', async () => {
  const f = fixture();
  try {
    await tick();
    f.control('end');
    await tick();
    expect(native.end).toHaveBeenCalledWith(id);
    f.update('incoming');
    await tick();
    expect(native.incoming).not.toHaveBeenCalled();
  } finally {
    f.stop();
  }
});

test('native ringing timeout is recorded as missed, not as a deliberate decline', async () => {
  const f = fixture();
  try {
    await tick();
    f.update('incoming');
    await tick();
    native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'timeout' }]);
    native.changed();
    await tick();
    expect(f.calls.end).toHaveBeenCalledWith(false, true, 'timeout');
  } finally {
    f.stop();
  }
});

test('a locked-screen video answer waits for foreground camera access', async () => {
  const previous = AppState.currentState;
  AppState.currentState = 'background';
  const f = fixture();
  try {
    await tick();
    f.update('incoming', 'video');
    await tick();
    native.drain.mockResolvedValueOnce([{ type: 'answer', id }]);
    native.changed();
    await tick();
    expect(f.calls.accept).not.toHaveBeenCalled();
    AppState.currentState = 'active';
    native.changed();
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
  } finally {
    AppState.currentState = previous;
    f.stop();
  }
});

test('caller identity updates the reported call from authenticated local data without delaying reporting', async () => {
  let finish!: (value: { name: string; phone: string }) => void;
  const caller = jest.fn(
    () =>
      new Promise<{ name: string; phone: string }>((resolve) => {
        finish = resolve;
      }),
  );
  const f = fixture(undefined, caller);
  try {
    f.update('incoming');
    await tick();
    expect(native.incoming).toHaveBeenCalledWith(id, false);
    expect(native.identify).not.toHaveBeenCalled();
    finish({ name: 'მეგობარი ❤️', phone: '+12025550101' });
    await tick();
    expect(native.identify).toHaveBeenCalledWith(id, 'მეგობარი ❤️', '+12025550101', false);
    f.update('active');
    await tick();
    expect(caller).toHaveBeenCalledTimes(1);
  } finally {
    f.stop();
  }
});
test('a delayed name lookup never renames a call that already ended', async () => {
  let finish!: (value: { name: string; phone: string }) => void;
  const f = fixture(
    undefined,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  try {
    f.update('incoming');
    await tick();
    f.update('ended');
    await tick();
    finish({ name: 'Old caller', phone: '+12025550101' });
    await tick();
    expect(native.identify).not.toHaveBeenCalled();
  } finally {
    f.stop();
  }
});

test('outgoing ringback starts once and stops on answer, never playing for incoming calls', async () => {
  const f = fixture();
  try {
    await tick();
    f.update('ringing', 'voice', false);
    await tick();
    expect(native.ringback).toHaveBeenLastCalledWith(id, true);
    f.update('ringing', 'voice', false);
    await tick();
    expect(native.ringback).toHaveBeenCalledTimes(1);
    f.update('connecting', 'voice', false);
    await tick();
    expect(native.ringback).toHaveBeenLastCalledWith(id, false);
    f.update('active', 'voice', false);
    await tick();
    expect(native.ringback).toHaveBeenCalledTimes(2);
    f.update('ended', 'voice', false);
    await tick();
    expect(native.end).toHaveBeenCalledWith(id);
  } finally {
    f.stop();
  }
  native.ringback.mockClear();
  const incoming = fixture();
  try {
    incoming.update('incoming');
    await tick();
    expect(native.ringback).not.toHaveBeenCalled();
  } finally {
    incoming.stop();
  }
});
