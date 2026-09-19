import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FindPhoneScreen } from '@/messenger/screens/FindPhoneScreen';
import type { Contact } from '@/messenger/model';
import type { PhoneCommand, PhoneResponse } from '@/messenger/phone-protocol';

jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
}));
const ownKey = 'a'.repeat(64);
const peer = 'b'.repeat(64);
let mockEnabled = true;
let mockRegistered = true;
let mockResult: string | null = peer;
const mockClient = {
  execute: jest.fn(async (command: PhoneCommand): Promise<PhoneResponse> => {
    if (command.action === 'status') return { registered: mockRegistered };
    if (command.action === 'lookup') return { key: mockResult };
    throw new Error('UNEXPECTED_COMMAND');
  }),
};
const mockEngine = {
  currentIdentity: () => ({ key: ownKey, secret: 'test-only', name: 'Development Alice' }),
  contacts: jest.fn(async (): Promise<Contact[]> => []),
  contactDisplayNames: jest.fn(async () => new Map<string, string>()),
  trustContact: jest.fn(async () => 'development-direct-chat'),
  trustPhoneContact: jest.fn(async () => 'development-direct-chat'),
};
const mockCalls = {
  subscribe: () => () => {},
  snapshot: () => null,
  start: jest.fn(async () => undefined),
};
const mockMesh = {
  focus: jest.fn(async () => undefined),
  online: jest.fn(() => true),
};
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: mockEngine,
    view: mockEngine,
    identity: mockEngine.currentIdentity(),
    calls: mockCalls,
    mesh: mockMesh,
  }),
}));
jest.mock('@/messenger/phone-client', () => ({
  devicePhoneClient: () => (mockEnabled ? mockClient : null),
}));
async function show(keypad = false) {
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={query}>
      <FindPhoneScreen intent="call" keypad={keypad} nativeHeader={keypad} />
    </QueryClientProvider>,
  );
}
async function enterAndFind() {
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+1 (202) 555-0102');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find on Mnelo' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: 'Find on Mnelo' }));
}
beforeEach(() => {
  mockEnabled = true;
  mockRegistered = true;
  mockResult = peer;
  mockMesh.online.mockReturnValue(true);
  mockEngine.contacts.mockResolvedValue([]);
});
test('dial pad remains usable with an unavailable service but cannot fake a call or request SMS', async () => {
  mockEnabled = false;
  await show();
  const input = screen.getByLabelText('Mobile number');
  expect(input.props.keyboardType).toBe('phone-pad');
  await fireEvent.changeText(input, '+12025550102');
  expect(screen.getByRole('button', { name: 'Find on Mnelo' })).toBeDisabled();
  expect(screen.getByText(/The phone service is unavailable/)).toBeOnTheScreen();
  expect(mockClient.execute).not.toHaveBeenCalled();
  expect(mockCalls.start).not.toHaveBeenCalled();
});
test('own enrollment remains required and typing does not send OTP or number lookup requests', async () => {
  mockRegistered = false;
  await show();
  await screen.findByText('Verify your own number before using number search.');
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+12025550102');
  expect(screen.getByRole('button', { name: 'Find on Mnelo' })).toBeDisabled();
  expect(mockClient.execute.mock.calls.map(([command]) => command.action)).toEqual(['status']);
});
test('a normalized number resolves a pinned contact and calls only after explicit media selection', async () => {
  mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Development Bob', blocked: false }]);
  await show();
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '123');
  expect(screen.getByRole('button', { name: 'Find on Mnelo' })).toBeDisabled();
  await enterAndFind();
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue to call' }));
  expect(mockClient.execute).toHaveBeenCalledWith({ action: 'lookup', phone: '+12025550102' });
  expect(mockCalls.start).not.toHaveBeenCalled();
  const voice = await screen.findByRole('button', { name: 'Voice call' });
  await waitFor(() => expect(voice).toBeEnabled());
  await fireEvent.press(voice);
  await waitFor(() => expect(mockCalls.start).toHaveBeenCalledWith(peer, 'voice'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/call/[id]',
    params: { id: 'development-direct-chat' },
  });
  expect(
    mockClient.execute.mock.calls.every(([c]) => c.action === 'status' || c.action === 'lookup'),
  ).toBe(true);
});
test('first-use number needs an explicit action and never starts offline media', async () => {
  mockMesh.online.mockReturnValue(false);
  await show();
  await enterAndFind();
  await screen.findByText('On Mnelo');
  expect(mockEngine.trustPhoneContact).not.toHaveBeenCalled();
  expect(mockCalls.start).not.toHaveBeenCalled();
  mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Development Bob', blocked: false }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue to call' }));
  expect(mockEngine.trustPhoneContact).toHaveBeenCalledWith({
    key: peer,
    phone: '+12025550102',
    name: 'Development Bob',
  });
  // Wait for the separate raw-trust query to settle before asserting that
  // offline reachability, rather than pending contact access, disables dialing.
  await waitFor(() => expect(mockMesh.focus).toHaveBeenCalledWith(peer));
  expect(screen.getByRole('button', { name: 'Voice call' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Video call' })).toBeDisabled();
  expect(mockCalls.start).not.toHaveBeenCalled();
});
test.each(['blocked', 'self', 'missing'] as const)(
  '%s result cannot initiate a call',
  async (kind) => {
    mockResult = kind === 'self' ? ownKey : kind === 'missing' ? null : peer;
    if (kind === 'blocked')
      mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Blocked person', blocked: true }]);
    await show();
    await enterAndFind();
    await screen.findByText(
      kind === 'self'
        ? 'This is your own Mnelo identity.'
        : 'No discoverable person was found for this number.',
    );
    expect(screen.queryByRole('button', { name: 'Continue to call' })).toBeNull();
    expect(mockEngine.trustContact).not.toHaveBeenCalled();
    expect(mockCalls.start).not.toHaveBeenCalled();
  },
);
test('editing a looked-up number clears the pinned result instead of calling the previous person', async () => {
  mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Development Bob', blocked: false }]);
  await show();
  await enterAndFind();
  await screen.findByRole('button', { name: 'Continue to call' });
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+12025550103');
  expect(screen.queryByRole('button', { name: 'Continue to call' })).toBeNull();
  expect(mockCalls.start).not.toHaveBeenCalled();
});
test('blocking after discovery is rechecked before the call action', async () => {
  mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Development Bob', blocked: false }]);
  await show();
  await enterAndFind();
  await screen.findByRole('button', { name: 'Continue to call' });
  mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Development Bob', blocked: true }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue to call' }));
  await screen.findByText('No discoverable person was found for this number.');
  expect(mockEngine.trustContact).not.toHaveBeenCalled();
  expect(mockCalls.start).not.toHaveBeenCalled();
});

test('keypad call action looks up a pinned number and starts voice without an extra chooser', async () => {
  mockEngine.contacts.mockResolvedValue([{ key: peer, name: 'Development Bob', blocked: false }]);
  await show(true);
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+12025550102');
  const call = screen.getByRole('button', { name: 'Voice call' });
  await waitFor(() => expect(call).toBeEnabled());
  await fireEvent.press(call);
  await waitFor(() => expect(mockCalls.start).toHaveBeenCalledWith(peer, 'voice'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/call/[id]',
    params: { id: 'development-direct-chat' },
  });
  expect(
    mockClient.execute.mock.calls.every(([c]) => c.action === 'status' || c.action === 'lookup'),
  ).toBe(true);
});

test('a different key returned for a pinned phone fails closed and preserves the saved contact', async () => {
  mockEngine.contacts.mockResolvedValue([
    { key: 'c'.repeat(64), phone: '+12025550102', name: 'Saved person', blocked: false },
  ]);
  await show();
  await enterAndFind();
  expect(await screen.findByRole('alert')).toHaveTextContent(/This number no longer matches/);
  expect(screen.queryByRole('button', { name: 'Continue to call' })).toBeNull();
  expect(mockEngine.trustPhoneContact).not.toHaveBeenCalled();
});
