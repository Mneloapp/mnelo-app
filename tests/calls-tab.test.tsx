import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CallsScreen, NewCallScreen } from '@/messenger/screens/CallsScreen';

jest.mock('@/messenger/screens/FindPhoneScreen', () => ({ FindPhoneScreen: () => null }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useIsFocused: () => true,
}));
const mockRuntime = {
  engine: {
    contacts: jest.fn(async () => [
      { key: 'alice', name: 'Development Alice', blocked: false },
      { key: 'blocked', name: 'Blocked contact', blocked: true },
    ]),
    callHistory: jest.fn(async () => []),
    trustContact: jest.fn(async () => 'direct-chat'),
  },
  mesh: { online: jest.fn(() => false), focus: jest.fn(async () => undefined) },
  calls: {
    subscribe: () => () => {},
    snapshot: () => null,
    start: jest.fn(async () => undefined),
  },
};
jest.mock('@/messenger/DeviceProvider', () => ({ useDevice: () => mockRuntime }));
async function show(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
beforeEach(() => {
  mockRuntime.mesh.online.mockReturnValue(false);
});
test('Calls displays an empty local history and opens the new-call picker', async () => {
  await show(<CallsScreen />);
  await screen.findByText('No calls yet. Start a voice or video call with a saved contact.');
  expect(screen.getByText('Call history stays on this device.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'New call' }));
  expect(router.push).toHaveBeenCalledWith('/new-call');
});
test('new calls exclude blocked contacts and cannot call an offline peer', async () => {
  await show(<NewCallScreen />);
  const contact = await screen.findByRole('button', { name: 'Voice call Development Alice' });
  expect(screen.queryByText('Blocked contact')).toBeNull();
  await fireEvent.press(contact);
  await waitFor(() => expect(mockRuntime.mesh.focus).toHaveBeenCalledWith('alice'));
  expect(screen.getByRole('button', { name: 'Voice call' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Video call' })).toBeDisabled();
  expect(mockRuntime.calls.start).not.toHaveBeenCalled();
});
test('the contact video button starts the call directly only after an explicit tap', async () => {
  mockRuntime.mesh.online.mockReturnValue(true);
  await show(<NewCallScreen />);
  const video = await screen.findByRole('button', { name: 'Video call Development Alice' });
  expect(mockRuntime.calls.start).not.toHaveBeenCalled();
  await fireEvent.press(video);
  await waitFor(() => expect(mockRuntime.calls.start).toHaveBeenCalledWith('alice', 'video'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/call/[id]',
    params: { id: 'direct-chat' },
  });
});
