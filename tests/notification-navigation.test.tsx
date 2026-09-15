import { act, renderHook } from '@testing-library/react-native';
import { useNotificationNavigation } from '@/messenger/useNotificationNavigation';
import type { AlertKind } from '@/messenger/device-alerts';

let mockTap: (kind: AlertKind, id?: string) => void;
let mockChanged: () => void;
let mockPath = '/';
let mockActive = true;
let mockReady = false;
const mockNavigate = jest.fn();
const mockPreview = jest.fn();
const mockWake = jest.fn();
const mockObserve = jest.fn((listener) => {
  mockTap = listener;
  return jest.fn();
});
const mockDevice = {
  identity: { key: 'owner' },
  authenticated: true,
  calls: null as unknown,
  mesh: { deliveryWake: mockWake },
  engine: {
    deliveryAtomic: jest.fn(),
    subscribe: (fn: () => void) => {
      mockChanged = fn;
      return jest.fn();
    },
  },
};
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  useRootNavigationState: () => (mockReady ? { key: 'root' } : undefined),
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}));
jest.mock('@/hooks/useAppActive', () => ({ useAppActive: () => mockActive }));
jest.mock('@/messenger/DeviceProvider', () => ({ useDevice: () => mockDevice }));
jest.mock('@/messenger/device-alerts', () => ({
  observeAlertTaps: (fn: unknown) => mockObserve(fn),
}));
jest.mock('@/messenger/notification-preview', () => ({
  availableNotificationPreview: (...args: unknown[]) => mockPreview(...args),
}));
beforeEach(() => {
  mockPath = '/';
  mockReady = false;
  mockActive = true;
  mockDevice.authenticated = true;
  mockDevice.calls = null;
  mockPreview.mockReset().mockResolvedValue(null);
});
test('cold launch waits for the root redirect and delayed inbox, then opens exactly the notified chat', async () => {
  const view = await renderHook(() => useNotificationNavigation());
  await act(() => mockTap('message', 'incoming-id'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockPreview).not.toHaveBeenCalled();
  mockReady = true;
  await view.rerender({});
  expect(mockPreview).not.toHaveBeenCalled();
  mockPath = '/chats';
  await view.rerender({});
  expect(mockPreview).toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  // Runtime initialization must not consume or cancel the pending tap.
  mockDevice.calls = { snapshot: () => null };
  await view.rerender({});
  mockPreview.mockResolvedValue({ chat: 'verified-conversation' });
  await act(async () => mockChanged());
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith({
    pathname: '/chat/[id]',
    params: { id: 'verified-conversation' },
  });
  expect(mockObserve).toHaveBeenCalledTimes(1);
});
test('background tap survives activation and unlock; a newer tap wins over a slow older lookup', async () => {
  mockPath = '/chat/already-open';
  mockReady = true;
  mockActive = false;
  mockDevice.authenticated = false;
  const view = await renderHook(() => useNotificationNavigation());
  await act(() => mockTap('message', 'old'));
  expect(mockPreview).not.toHaveBeenCalled();
  mockActive = true;
  mockDevice.authenticated = true;
  let finish!: (value: { chat: string }) => void;
  mockPreview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await view.rerender({});
  mockPreview.mockResolvedValue({ chat: 'new-chat' });
  await act(() => mockTap('message', 'new'));
  await act(async () => finish({ chat: 'old-chat' }));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'new-chat' } });
});
test('an unavailable or rejected message never invents a destination from the push payload', async () => {
  mockPath = '/chats';
  mockReady = true;
  await renderHook(() => useNotificationNavigation());
  await act(() => mockTap('message', 'unknown'));
  await act(async () => mockChanged());
  expect(mockNavigate).not.toHaveBeenCalled();
  mockPreview.mockRejectedValueOnce(new Error('DEVICE_CLOSED'));
  await act(async () => mockChanged());
  expect(mockNavigate).not.toHaveBeenCalled();
});
