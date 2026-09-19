import { act, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AppText } from '@/components/AppText';
import { DeviceProvider, useDevice } from '@/messenger/DeviceProvider';
import { emptyProfile } from '@/messenger/local-profile';
import { theme } from '@/theme/tokens';
import type { Chat } from '@/messenger/model';

const mockPhoneNames = jest.fn();
const mockReleaseNetwork = jest.fn();
const mockAcquireNetwork = jest.fn(() => ({ release: mockReleaseNetwork }));
const mockReleaseEngine = jest.fn();
const mockNetwork = { mesh: null, calls: null, invalid: false, delivery: null };
const mockChat = { id: 'chat', kind: 'direct', peer: 'peer', title: 'Profile name' } as Chat;
const mockEngine = {
  currentIdentity: () => ({ key: 'owner', name: 'Owner' }),
  currentEnrollment: () => ({ phone: '+12025550102' }),
  currentProfile: () => emptyProfile,
  subscribe: () => jest.fn(),
  flush: async () => {},
  contacts: async () => [
    { key: 'peer', phone: '+12025550101', name: 'Profile name', blocked: false },
  ],
  contactDisplayNames: async () => new Map([['peer', 'Profile name']]),
  chatPage: async (
    _filter: unknown,
    _search: unknown,
    _before: unknown,
    title: (chat: Chat) => string,
  ) => ({ rows: [{ ...mockChat, title: title(mockChat) }] }),
};
jest.mock('@/messenger/device-runtime', () => ({
  acquireDeviceEngine: async () => ({ engine: mockEngine, release: mockReleaseEngine }),
  acquireDeviceNetwork: (...args: unknown[]) => mockAcquireNetwork(...(args as [])),
  deviceNetworkSnapshot: () => mockNetwork,
  observeDeviceNetwork: () => jest.fn(),
  deviceNetworkFailed: jest.fn(),
}));
jest.mock('@/messenger/enrollment', () => ({ enrollmentAllowsAccess: () => true }));
jest.mock('@/messenger/phonebook', () => ({
  savedPhoneNames: (...args: unknown[]) => mockPhoneNames(...args),
  observeNativePhonebook: () => jest.fn(),
}));

function ChatNames() {
  const { view } = useDevice();
  const query = useQuery({
    queryKey: ['device', 'chats'],
    queryFn: () => view.chats(),
  });
  return (
    <>
      <AppText>Application is ready</AppText>
      <AppText>{query.data?.[0]?.title ?? 'Reading contact names'}</AppText>
    </>
  );
}

test('cold launch starts the network and opens the app while the first name query waits for Contacts', async () => {
  jest.useFakeTimers();
  let finish!: (names: Map<string, string>) => void;
  mockPhoneNames.mockImplementationOnce(
    () => new Promise<Map<string, string>>((resolve) => (finish = resolve)),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = await render(
    <QueryClientProvider client={client}>
      <DeviceProvider>
        <ChatNames />
      </DeviceProvider>
    </QueryClientProvider>,
  );
  try {
    await act(async () => jest.advanceTimersByTime(theme.motion.welcomeMinimumMs));
    expect(mockAcquireNetwork).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Application is ready')).toBeOnTheScreen();
    expect(screen.getByText('Reading contact names')).toBeOnTheScreen();
    expect(screen.queryByText('Profile name')).toBeNull();

    await act(async () => finish(new Map([['+12025550101', 'ჩემი მეგობარი 💕']])));
    await act(async () => jest.advanceTimersByTime(1));
    expect(screen.getByText('ჩემი მეგობარი 💕')).toBeOnTheScreen();
    expect(screen.queryByText('Profile name')).toBeNull();
    expect(mockAcquireNetwork).toHaveBeenCalledTimes(1);
  } finally {
    await result.unmount();
    client.clear();
    jest.useRealTimers();
  }
  expect(mockReleaseNetwork).toHaveBeenCalledTimes(1);
  expect(mockReleaseEngine).toHaveBeenCalledTimes(1);
});
