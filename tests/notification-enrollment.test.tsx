import { render, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNotificationEnrollment } from '@/messenger/useNotificationEnrollment';
import { enableAlertsByDefault } from '@/messenger/device-alerts';
import { retryBackground, setBackgroundStatus } from '@/messenger/background-status';
let mockActive = true;
jest.mock('@/hooks/useAppActive', () => ({ useAppActive: () => mockActive }));
jest.mock('@/messenger/device-alerts', () => ({ enableAlertsByDefault: jest.fn() }));
jest.mock('@/messenger/background-status', () => ({
  retryBackground: jest.fn(async () => {}),
  setBackgroundStatus: jest.fn(),
}));
const allowed = { allowed: true, canAsk: false, supported: true, undetermined: false };
let cache: QueryClient;
function Probe({ authenticated, path = '/chats' }: { authenticated: boolean; path?: string }) {
  useNotificationEnrollment(authenticated, path);
  return null;
}
function Wrapper({ children }: React.PropsWithChildren) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  mockActive = true;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(enableAlertsByDefault).mockReset().mockResolvedValue(allowed);
});
afterEach(() => cache.clear());
test('permission is requested after successful registration and leaving the phone screen', async () => {
  const view = await render(<Probe authenticated={false} path="/identity" />, { wrapper: Wrapper });
  expect(enableAlertsByDefault).not.toHaveBeenCalled();
  await view.rerender(<Probe authenticated path="/identity" />);
  expect(enableAlertsByDefault).not.toHaveBeenCalled();
  await view.rerender(<Probe authenticated />);
  await waitFor(() => expect(retryBackground).toHaveBeenCalledTimes(1));
  expect(cache.getQueryData(['device', 'alert-permission'])).toEqual(allowed);
  await view.rerender(<Probe authenticated path="/calls" />);
  expect(enableAlertsByDefault).toHaveBeenCalledTimes(1);
});
test('background startup waits until foreground and never prompts over a call', async () => {
  mockActive = false;
  const view = await render(<Probe authenticated />, { wrapper: Wrapper });
  expect(enableAlertsByDefault).not.toHaveBeenCalled();
  mockActive = true;
  await view.rerender(<Probe authenticated path="/call/test-id" />);
  expect(enableAlertsByDefault).not.toHaveBeenCalled();
  await view.rerender(<Probe authenticated />);
  await waitFor(() => expect(enableAlertsByDefault).toHaveBeenCalledTimes(1));
});
test('denial remains off without registering an alert token', async () => {
  jest.mocked(enableAlertsByDefault).mockResolvedValue({ ...allowed, allowed: false });
  await render(<Probe authenticated />, { wrapper: Wrapper });
  await waitFor(() =>
    expect(cache.getQueryData(['device', 'alert-permission'])).toEqual({
      ...allowed,
      allowed: false,
    }),
  );
  expect(retryBackground).not.toHaveBeenCalled();
});
test('logout cancels pending permission work and prevents registration', async () => {
  let isCurrent!: () => boolean;
  let finish!: (result: typeof allowed) => void;
  jest.mocked(enableAlertsByDefault).mockImplementation((current) => {
    isCurrent = current;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const view = await render(<Probe authenticated />, { wrapper: Wrapper });
  await view.rerender(<Probe authenticated={false} />);
  expect(isCurrent()).toBe(false);
  await act(async () => finish(allowed));
  expect(retryBackground).not.toHaveBeenCalled();
  expect(cache.getQueryData(['device', 'alert-permission'])).toBeUndefined();
});
test('permission errors are visible in settings without breaking registration', async () => {
  jest.mocked(enableAlertsByDefault).mockRejectedValue(new Error('NATIVE_PERMISSION_ERROR'));
  await render(<Probe authenticated />, { wrapper: Wrapper });
  await waitFor(() => expect(setBackgroundStatus).toHaveBeenCalledWith('unavailable'));
  expect(retryBackground).not.toHaveBeenCalled();
});
