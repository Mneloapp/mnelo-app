import { act, renderHook } from '@testing-library/react-native';
import { useCallDuration } from '@/messenger/useCallDuration';
import type { DeviceCall } from '@/messenger/calls';
test('elapsed call time starts on connection, survives remount and pauses at the terminal time', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(100000);
  const call = { id: 'call', status: 'ringing' } as DeviceCall;
  const hook = await renderHook(({ call }: { call: DeviceCall }) => useCallDuration(call), {
    initialProps: { call },
  });
  expect(hook.result.current).toBeNull();
  await hook.rerender({ call: { ...call, status: 'active', connectedAt: 100000 } });
  expect(hook.result.current).toBe('0:00');
  await act(() => jest.advanceTimersByTime(65000));
  expect(hook.result.current).toBe('1:05');
  await hook.unmount();
  const resumed = await renderHook(() =>
    useCallDuration({ ...call, status: 'active', connectedAt: 100000 }),
  );
  expect(resumed.result.current).toBe('1:05');
  await resumed.unmount();
  const ended = await renderHook(() =>
    useCallDuration({ ...call, status: 'ended', connectedAt: 100000, endedAt: 165000 }),
  );
  await act(() => jest.advanceTimersByTime(60000));
  expect(ended.result.current).toBe('1:05');
  await ended.unmount();
  jest.useRealTimers();
});
