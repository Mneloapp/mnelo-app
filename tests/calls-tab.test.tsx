import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { LocalCall } from '@/messenger/model';
import { CallsScreen, NewCallScreen } from '@/messenger/screens/CallsScreen';

jest.mock('@/messenger/phone-client', () => ({ devicePhoneClient: () => null }));
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
    callHistory: jest.fn(async (): Promise<LocalCall[]> => []),
    trustContact: jest.fn(async () => 'direct-chat'),
  },
  mesh: { online: jest.fn(() => false), focus: jest.fn(async () => undefined) },
  calls: {
    supportsQueuedSignaling: false,
    subscribe: () => () => {},
    snapshot: () => null,
    start: jest.fn(async () => undefined),
  },
};
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ ...mockRuntime, view: mockRuntime.engine }),
}));
async function show(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRuntime.calls.supportsQueuedSignaling = false;
  mockRuntime.mesh.online.mockReturnValue(false);
});
test('Calls displays an empty local history and opens the new-call picker', async () => {
  await show(<CallsScreen />);
  await screen.findByText('No calls yet. Start a voice or video call with a saved contact.');
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

test('pulling the call list down reveals search, and cancelling restores the compact list', async () => {
  await show(<CallsScreen />);
  await screen.findByText('No calls yet. Start a voice or video call with a saved contact.');
  expect(screen.queryByRole('search')).toBeNull();
  await fireEvent(screen.getByTestId('calls-history'), 'scrollBeginDrag', {
    nativeEvent: { contentOffset: { x: 0, y: 0 } },
  });
  await fireEvent(screen.getByTestId('calls-history'), 'scroll', {
    nativeEvent: {
      contentOffset: { x: 0, y: -45 },
      layoutMeasurement: { width: 390, height: 600 },
      contentSize: { width: 390, height: 700 },
    },
  });
  expect(screen.getByLabelText('Name or phone number')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  // Closing scrolls the persistent header away; it must not unmount the input.
  expect(screen.getByLabelText('Name or phone number')).toHaveProp('value', '');
});

test.each(['voice', 'video'] as const)(
  'history row starts a %s call directly; info opens actions separately',
  async (media) => {
    mockRuntime.calls.supportsQueuedSignaling = true;
    mockRuntime.engine.callHistory.mockResolvedValueOnce([
      {
        id: 'record',
        chatId: 'direct-chat',
        peer: 'alice',
        name: 'Development Alice',
        media,
        status: 'ended',
        direction: 'outgoing',
        unseen: 0,
        endedAt: Date.now(),
        sequence: 1,
      },
    ]);
    await show(<CallsScreen />);
    const row = await screen.findByRole('button', { name: /^Development Alice\. Outgoing/ });
    await fireEvent.press(row);
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/call/[id]',
      params: { id: 'direct-chat', media },
    });
    expect(screen.queryByText('Remove from my history')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Call details for Development Alice' }),
    );
    await screen.findByText('Remove from my history');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voice call' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Voice call' }));
    await waitFor(() => expect(mockRuntime.calls.start).toHaveBeenCalledWith('alice', 'voice'));
    expect(mockRuntime.engine.trustContact).toHaveBeenLastCalledWith({
      key: 'alice',
      name: 'Development Alice',
    });
  },
);
