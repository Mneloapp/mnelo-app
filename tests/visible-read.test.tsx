import { renderHook, waitFor } from '@testing-library/react-native';
import { useVisibleRead } from '@/messenger/useVisibleRead';
import type { DeviceMessenger } from '@/messenger/engine';
let mockFocused = false;
let mockActive = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/hooks/useAppActive', () => ({ useAppActive: () => mockActive }));
test('only the visible foreground screen acknowledges the exact displayed message/call snapshot', async () => {
  const markRead = jest.fn(async () => undefined);
  const markCallsSeen = jest.fn(async () => undefined);
  const engine = { markRead, markCallsSeen } as unknown as DeviceMessenger;
  const hook = await renderHook<void, { chat: string | null; through: number }>(
    ({ chat, through }) => useVisibleRead(engine, chat, through),
    {
      initialProps: { chat: 'chat' as string | null, through: 42 },
    },
  );
  expect(markRead).not.toHaveBeenCalled();
  mockFocused = true;
  mockActive = false;
  await hook.rerender({ chat: 'chat', through: 43 });
  expect(markRead).not.toHaveBeenCalled();
  mockActive = true;
  await hook.rerender({ chat: 'chat', through: 43 });
  await waitFor(() => expect(markRead).toHaveBeenCalledWith('chat', 43));
  expect(markCallsSeen).not.toHaveBeenCalled();
  mockFocused = false;
  await hook.rerender({ chat: null, through: 90 });
  expect(markCallsSeen).not.toHaveBeenCalled();
  mockFocused = true;
  await hook.rerender({ chat: null, through: 90 });
  await waitFor(() => expect(markCallsSeen).toHaveBeenCalledWith(90));
  expect(markRead).toHaveBeenCalledTimes(1);
});
