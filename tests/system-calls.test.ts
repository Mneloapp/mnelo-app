import { AppState } from 'react-native';
import {
  observeSystemCalls,
  systemCallSpeaker,
  prepareSystemCallAudio,
} from '@/messenger/system-calls.native';
import type { DeviceCalls, DeviceCall, CallControl } from '@/messenger/calls';
import type { PhoneClient } from '@/messenger/phone-client';
import { retryBackground, backgroundSnapshot } from '@/messenger/background-status';

jest.mock('expo-modules-core', () => {
  const native = {
    changed: () => {},
    state: jest.fn(async () => ({ environment: 'sandbox', voipToken: 'a'.repeat(64) })),
    drain: jest.fn(async (): Promise<unknown[]> => []),
    configureAccount: jest.fn(async () => {}),
    acknowledgeEnd: jest.fn(async () => {}),
    incoming: jest.fn(async () => {}),
    outgoing: jest.fn(async () => {}),
    answer: jest.fn(async () => {}),
    connected: jest.fn(async () => {}),
    ringback: jest.fn(async () => {}),
    identify: jest.fn(async () => {}),
    end: jest.fn(async () => {}),
    speaker: jest.fn(async () => {}),
    prepareCallAudio: jest.fn(async () => {}),
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
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: 'b'.repeat(64) })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(async () => 'a'.repeat(64)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
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
    owner: 'owner',
    endFromSystem: jest.fn(async (callId: string, reason: string, failed: boolean) => {
      if (value?.id !== callId) return false;
      if (value.status !== 'ended') await calls.end(failed, true, reason);
      return true;
    }),
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
    end: jest.fn(async (_failed?: boolean, _notify?: boolean, _reason?: string) => {
      value = { ...value!, status: 'ended' };
      changed();
    }),
    mute: jest.fn(),
    audioRoute: jest.fn(),
    confirmIncoming: jest.fn(async () => {}),
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
    ringingConfirmed = false,
    peer?: string,
    callId = id,
  ) => {
    value = {
      id: callId,
      incoming,
      media,
      status,
      ...(status === 'active' ? { connectedAt: 1234567890000 } : {}),
      ringingConfirmed,
      local: {},
      ...(peer ? { peer } : {}),
    } as DeviceCall;
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
  notifications.getDevicePushTokenAsync
    .mockReset()
    .mockResolvedValue({ type: 'ios', data: 'b'.repeat(64) });
});

test('native hangup is delivered while an answered video call still waits for capture', async () => {
  const initialState = AppState.currentState;
  AppState.currentState = 'active';
  const f = fixture();
  let finishCapture!: () => void;
  const capture = new Promise<void>((resolve) => (finishCapture = resolve));
  f.calls.accept.mockImplementationOnce(async () => {
    f.update('connecting', 'video');
    await capture;
  });
  try {
    f.update('incoming', 'video');
    await tick();
    native.drain.mockResolvedValueOnce([{ type: 'answer', id }]);
    native.changed();
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
    native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'local' }]);
    native.changed();
    await tick();
    expect(f.calls.endFromSystem).toHaveBeenCalledWith(id, 'local', false);
    expect(native.acknowledgeEnd).toHaveBeenCalledWith(id, 'a'.repeat(64));
    expect(f.calls.snapshot()?.status).toBe('ended');
    finishCapture();
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
    expect(native.connected).not.toHaveBeenCalled();
  } finally {
    finishCapture();
    f.stop();
    AppState.currentState = initialState;
  }
});

test('APNs echoes on token reads stop after registration, while a rotated token registers once', async () => {
  let token = { type: 'ios', data: 'b'.repeat(64) };
  notifications.getDevicePushTokenAsync.mockImplementation(async () => {
    notifications.addPushTokenListener.mock.calls[0][0](token);
    return token;
  });
  const f = fixture();
  try {
    await tick();
    await tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 100; i++) notifications.addPushTokenListener.mock.calls[0][0](token);
    await tick();
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(2);
    token = { type: 'ios', data: 'c'.repeat(64) };
    notifications.addPushTokenListener.mock.calls[0][0](token);
    await tick();
    expect(f.execute).toHaveBeenCalledTimes(3);
    expect(f.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        registration: expect.objectContaining({ channel: 'alert', token: token.data }),
      }),
    );
    await retryBackground();
    expect(f.execute).toHaveBeenCalledTimes(3);
  } finally {
    f.stop();
  }
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
    expect(native.connected).toHaveBeenCalledWith(id, 1234567890000);
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

test('a native decline reports the decline reason to the remote caller', async () => {
  const f = fixture();
  try {
    await tick();
    f.update('incoming');
    await tick();
    native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'decline' }]);
    native.changed();
    await tick();
    expect(f.calls.end).toHaveBeenCalledWith(false, true, 'decline');
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
    await tick();
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

test('an incoming call carries an opaque caller cache hint to native CallKit', async () => {
  const f = fixture();
  try {
    f.update('incoming', 'voice', true, false, 'peer-key');
    await tick();
    expect(native.incoming).toHaveBeenCalledWith(id, false, 'a'.repeat(64));
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

test('outgoing ringback waits for recipient confirmation and stops on answer, never playing for incoming calls', async () => {
  const f = fixture();
  try {
    await tick();
    f.update('ringing', 'voice', false);
    await tick();
    expect(native.ringback).not.toHaveBeenCalled();
    f.update('ringing', 'voice', false, true);
    await tick();
    expect(native.ringback).toHaveBeenLastCalledWith(id, true);
    f.update('ringing', 'voice', false, true);
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

test.each(['report-first', 'invite-first'])(
  'ringing confirmation requires both native presentation and the authenticated invite: %s',
  async (order) => {
    const previous = AppState.currentState;
    AppState.currentState = 'background';
    const f = fixture();
    try {
      await tick();
      if (order === 'invite-first') f.update('incoming');
      else {
        native.drain.mockResolvedValueOnce([{ type: 'incoming', id, video: false }]);
        native.changed();
      }
      await tick();
      expect(f.calls.confirmIncoming).not.toHaveBeenCalled();
      if (order === 'report-first') f.update('incoming');
      else {
        native.drain.mockResolvedValueOnce([{ type: 'incoming', id, video: false }]);
        native.changed();
      }
      await tick();
      expect(f.calls.confirmIncoming).toHaveBeenCalledWith(id);
      expect(f.calls.accept).not.toHaveBeenCalled();
    } finally {
      f.stop();
      AppState.currentState = previous;
    }
  },
);

test('native failure or an already answered cold call cannot send a false ringing confirmation', async () => {
  for (const value of [
    [{ type: 'end', id, code: 'NATIVE_INCOMING_FAILED' }],
    [
      { type: 'incoming', id },
      { type: 'answer', id },
    ],
    [
      { type: 'incoming', id },
      { type: 'end', id },
    ],
  ]) {
    const f = fixture();
    try {
      await tick();
      native.drain.mockResolvedValueOnce(value);
      native.changed();
      await tick();
      f.update('incoming');
      await tick();
      expect(f.calls.confirmIncoming).not.toHaveBeenCalled();
    } finally {
      f.stop();
    }
  }
});

test('iOS speaker selection and initial capture configuration use the CallKit owner', async () => {
  await expect(prepareSystemCallAudio(true)).resolves.toBe(true);
  await expect(systemCallSpeaker(true)).resolves.toBe(true);
  await expect(systemCallSpeaker(false)).resolves.toBe(true);
  expect(native.prepareCallAudio).toHaveBeenCalledWith(true);
  expect(native.speaker.mock.calls).toEqual([[true], [false]]);
});

test('native decline is acknowledged only after its authenticated terminal work completes', async () => {
  const f = fixture();
  let complete!: (value: boolean) => void;
  try {
    await tick();
    f.update('incoming');
    await tick();
    f.calls.endFromSystem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'decline' }]);
    native.changed();
    await tick();
    expect(native.acknowledgeEnd).not.toHaveBeenCalled();
    complete(true);
    await tick();
    expect(native.acknowledgeEnd).toHaveBeenCalledWith(id, 'a'.repeat(64));
  } finally {
    f.stop();
  }
});

test('cold native decline waits for the exact authenticated invite and survives a failed write', async () => {
  jest.useFakeTimers();
  const f = fixture();
  try {
    await tick();
    native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'decline' }]);
    native.changed();
    await tick();
    expect(native.acknowledgeEnd).not.toHaveBeenCalled();
    f.calls.endFromSystem.mockRejectedValueOnce(new Error('DATABASE_SUSPENDED'));
    f.update('incoming');
    await tick();
    expect(native.acknowledgeEnd).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    await tick();
    expect(f.calls.end).toHaveBeenCalledWith(false, true, 'decline');
    expect(native.acknowledgeEnd).toHaveBeenCalledWith(id, 'a'.repeat(64));
    expect(native.incoming).not.toHaveBeenCalled();
  } finally {
    f.stop();
    jest.useRealTimers();
  }
});

test('disposing a runtime while terminal work waits does not acknowledge or erase its native intent', async () => {
  const f = fixture();
  let complete!: (value: boolean) => void;
  await tick();
  f.update('incoming');
  await tick();
  f.calls.endFromSystem.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'decline' }]);
  native.changed();
  await tick();
  f.stop();
  complete(true);
  await tick();
  expect(native.acknowledgeEnd).not.toHaveBeenCalled();
  expect(native.configureAccount).toHaveBeenCalledTimes(1);
});

test('a pending previous decline upload never blocks answering the next native call', async () => {
  const f = fixture();
  const nextId = 'a9870ee4-4c80-4bb3-9b52-a9c77f905b9a';
  let uploaded!: (value: boolean) => void;
  try {
    await tick();
    f.update('incoming');
    await tick();
    f.calls.endFromSystem.mockImplementationOnce(async () => {
      await f.calls.end();
      return new Promise((resolve) => {
        uploaded = resolve;
      });
    });
    native.drain.mockResolvedValueOnce([{ type: 'end', id, reason: 'decline' }]);
    native.changed();
    await tick();
    expect(native.acknowledgeEnd).not.toHaveBeenCalled();
    f.update('incoming', 'voice', true, false, undefined, nextId);
    native.drain.mockResolvedValueOnce([{ type: 'answer', id: nextId }]);
    native.changed();
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
    expect(f.calls.snapshot()).toMatchObject({ id: nextId, status: 'connecting' });
    uploaded(true);
    await tick();
    expect(f.calls.snapshot()?.id).toBe(nextId);
  } finally {
    f.stop();
  }
});

test('an authenticated native answer bypasses a pending presentation callback without waiting for it', async () => {
  let finishPresentation!: () => void;
  native.incoming.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishPresentation = resolve;
      }),
  );
  const f = fixture();
  try {
    await tick();
    f.update('incoming');
    await tick();
    expect(native.incoming).toHaveBeenCalled();
    native.drain.mockResolvedValueOnce([{ type: 'answer', id }]);
    native.changed();
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
    expect(f.calls.snapshot()?.status).toBe('connecting');
    finishPresentation();
    await tick();
    expect(f.calls.accept).toHaveBeenCalledTimes(1);
  } finally {
    finishPresentation?.();
    f.stop();
  }
});

test('answer and hangup drained in the same native batch never open media', async () => {
  const f = fixture();
  try {
    f.update('incoming');
    await tick();
    native.drain.mockResolvedValueOnce([
      { type: 'answer', id },
      { type: 'end', id, reason: 'local' },
    ]);
    native.changed();
    await tick();
    expect(f.calls.accept).not.toHaveBeenCalled();
    expect(f.calls.endFromSystem).toHaveBeenCalledWith(id, 'local', false);
  } finally {
    f.stop();
  }
});
