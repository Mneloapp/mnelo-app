import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ContactProfileScreen } from '@/messenger/screens/ContactProfileScreen';
import { Page } from '@/components/ui';

const mockPeer = 'b'.repeat(64);
let mockBlocked = false;
const mockEngine = {
  acceptsPeer: jest.fn(async () => !mockBlocked),
  contactProfile: jest.fn(async () => ({
    username: 'mnelo_name',
    firstName: 'Protocol name',
    avatar: '',
    headline: '',
    about: '',
    email: '',
    website: '',
  })),
  clearLocalHistory: jest.fn(async () => {}),
  block: jest.fn(async (_key: string, blocked: boolean) => {
    mockBlocked = blocked;
  }),
  trustContact: jest.fn(),
};
const mockCalls = {
  subscribe: () => () => {},
  snapshot: () => null,
  start: jest.fn(async () => {}),
  supportsQueuedSignaling: true,
};
jest.mock('@/messenger/crypto', () => ({ directChatId: () => 'direct-chat' }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ key: mockPeer }),
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: mockEngine,
    identity: { key: 'a'.repeat(64) },
    calls: mockCalls,
    view: {
      contacts: async () => [
        { key: mockPeer, name: 'My phonebook name', phone: '+15555550102', blocked: mockBlocked },
      ],
    },
  }),
}));
async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <ContactProfileScreen />
    </QueryClientProvider>,
  );
  await screen.findByText('My phonebook name');
}
beforeEach(() => {
  mockBlocked = false;
});
test('contact info shows local phonebook identity and returns to the same conversation without rewriting the alias', async () => {
  await show();
  expect(screen.getByText('+15555550102')).toBeOnTheScreen();
  expect(mockCalls.start).not.toHaveBeenCalled();
  expect(mockEngine.clearLocalHistory).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Message' }));
  expect(router.dismissTo).toHaveBeenCalledWith({
    pathname: '/chat/[id]',
    params: { id: 'direct-chat' },
  });
  expect(mockEngine.trustContact).not.toHaveBeenCalled();
});
test('clearing and blocking require the selected action, and blocking disables calls until unblocked', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear history on this device' }));
  expect(mockEngine.clearLocalHistory).not.toHaveBeenCalled();
  await act(() => alert.mock.calls[0]?.[2]?.[1]?.onPress?.());
  await waitFor(() => expect(mockEngine.clearLocalHistory).toHaveBeenCalledWith('direct-chat'));
  await fireEvent.press(screen.getByRole('button', { name: 'Block contact' }));
  expect(mockEngine.block).not.toHaveBeenCalled();
  await act(() => alert.mock.calls[1]?.[2]?.[1]?.onPress?.());
  await screen.findByRole('button', { name: 'Unblock' });
  expect(screen.getByRole('button', { name: 'Voice call' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Message' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Unblock' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Voice call' })).not.toBeDisabled(),
  );
  alert.mockRestore();
});
test('contact voice/video buttons start exactly the requested call only on tap', async () => {
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Video call' }));
  expect(mockCalls.start).toHaveBeenCalledTimes(1);
  expect(mockCalls.start).toHaveBeenCalledWith(mockPeer, 'video');
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/call/[id]',
    params: { id: 'direct-chat' },
  });
});
test('the header name and avatar form one accessible contact-info navigation target', async () => {
  const open = jest.fn();
  await render(
    <Page
      back
      title="My friend"
      avatarName="My friend"
      titleActionLabel="Contact info"
      onTitlePress={open}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Contact info' }));
  expect(open).toHaveBeenCalledTimes(1);
});

test('shared-content row opens the current direct conversation library without starting a call', async () => {
  await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Media, links and docs' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/shared/[id]',
    params: { id: 'direct-chat' },
  });
  expect(mockCalls.start).not.toHaveBeenCalled();
});
