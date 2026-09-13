import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CallContactSearch } from '@/messenger/components/CallContactSearch';
import type { Contact } from '@/messenger/model';

const mockContacts = jest.fn<Promise<Contact[]>, []>(async () => []);
const mockPhonebook = jest.fn(async () => [{ name: 'My saved friend', phone: '+12025550101' }]);
const mockLookup = jest.fn(async (_command: unknown) => ({ key: 'b'.repeat(64) }));
const mockTrust = jest.fn(async () => 'chat');
const mockStart = jest.fn(async () => {});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/messenger/phonebook', () => ({
  searchPhonebook: (...args: unknown[]) => mockPhonebook(...(args as [])),
}));
jest.mock('@/messenger/phone-client', () => ({ devicePhoneClient: () => null }));
jest.mock('@/messenger/screens/phone-shared', () => ({
  ...jest.requireActual('@/messenger/screens/phone-shared'),
  usePhoneService: () => ({
    client: { execute: mockLookup },
    status: { data: { registered: true } },
  }),
}));
jest.mock('@/messenger/components/ContactCard', () => ({ PeerAvatar: () => null }));
jest.mock('@/messenger/screens/CallActions', () => ({ CallActions: () => null }));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    identity: { key: 'a'.repeat(64) },
    enrollment: { phone: '+12025550100' },
    engine: { contacts: mockContacts, trustPhoneContact: mockTrust, trustContact: mockTrust },
    view: { contacts: mockContacts },
    calls: { snapshot: () => null, supportsQueuedSignaling: true, start: mockStart },
  }),
}));
async function show(search = 'saved') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const result = await render(
    <QueryClientProvider client={client}>
      <CallContactSearch search={search} />
    </QueryClientProvider>,
  );
  return { client, result };
}
beforeEach(() => {
  mockContacts.mockResolvedValue([]);
  mockPhonebook.mockResolvedValue([{ name: 'My saved friend', phone: '+12025550101' }]);
  mockLookup.mockResolvedValue({ key: 'b'.repeat(64) });
});
test('search sends only matching phone numbers and a call requires an explicit tap plus a fresh identity check', async () => {
  const { client } = await show();
  const button = await screen.findByRole('button', { name: 'Voice call My saved friend' });
  expect(mockLookup).toHaveBeenCalledWith({ action: 'lookup', phone: '+12025550101' });
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockTrust).not.toHaveBeenCalled();
  await fireEvent.press(button);
  await waitFor(() => expect(mockStart).toHaveBeenCalledWith('b'.repeat(64), 'voice'));
  expect(mockLookup).toHaveBeenCalledTimes(2);
  expect(mockTrust).toHaveBeenCalledWith({
    key: 'b'.repeat(64),
    phone: '+12025550101',
    name: 'My saved friend',
  });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/call/[id]', params: { id: 'chat' } });
  client.clear();
});
test('a changed phone identity between search and call is never trusted or dialled', async () => {
  const { client } = await show();
  const button = await screen.findByRole('button', { name: 'Video call My saved friend' });
  mockLookup.mockResolvedValueOnce({ key: 'c'.repeat(64) });
  await fireEvent.press(button);
  await screen.findByRole('alert');
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockTrust).not.toHaveBeenCalled();
  client.clear();
});
test('blocked and re-bound phone contacts never appear as quick-call targets', async () => {
  mockContacts.mockResolvedValue([
    { key: 'b'.repeat(64), name: 'Blocked', phone: '+12025550101', blocked: true },
  ]);
  const { client } = await show();
  await screen.findByText('No Mnelo contacts found. Try a more specific name or number.');
  expect(screen.queryByRole('button', { name: 'Voice call My saved friend' })).toBeNull();
  expect(mockStart).not.toHaveBeenCalled();
  client.clear();
});
test('a phone directory failure retains a known contact instead of hiding it', async () => {
  mockContacts.mockResolvedValue([{ key: 'd'.repeat(64), name: 'A saved friend', blocked: false }]);
  mockLookup.mockRejectedValueOnce(new Error('offline'));
  const { client } = await show();
  await screen.findByRole('button', { name: 'Voice call A saved friend' });
  expect(mockStart).not.toHaveBeenCalled();
  client.clear();
});
