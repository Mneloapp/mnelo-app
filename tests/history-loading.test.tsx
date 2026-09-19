import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChatsScreen } from '@/messenger/screens/HomeScreens';
import { CallsScreen } from '@/messenger/screens/CallsScreen';
import type { Chat, LocalCall } from '@/messenger/model';
jest.mock('@/messenger/export-chat', () => ({ exportChat: jest.fn(async () => {}) }));

jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('@/messenger/phone-client', () => ({ devicePhoneClient: () => null }));
jest.mock('@/messenger/screens/FindPhoneScreen', () => ({ FindPhoneScreen: () => null }));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.requireActual('react').useEffect,
  useIsFocused: () => true,
  router: { push: jest.fn() },
}));
const mockEngine = {
  contactRequests: jest.fn(async () => []),
  contactProfile: jest.fn(async () => ({ avatar: '' })),
  chatPage: jest.fn(async (): Promise<{ rows: Chat[]; next: undefined }> => ({
    rows: [],
    next: undefined,
  })),
  callHistory: jest.fn(async (): Promise<LocalCall[]> => []),
  markCallsSeen: jest.fn(async () => {}),
};
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: mockEngine, view: mockEngine }),
}));
const chat: Chat = {
  id: 'chat',
  kind: 'direct',
  title: 'Saved contact',
  peer: 'peer',
  owner: 'own',
  revision: 1,
  left_group: 0,
  unread: 0,
  preview: 'A message',
  previewKind: 'text',
  activity: 1,
  updated: 1,
};
const call: LocalCall = {
  id: 'record',
  chatId: 'chat',
  peer: 'peer',
  name: 'Saved contact',
  media: 'voice',
  status: 'ended',
  direction: 'outgoing',
  unseen: 0,
  endedAt: 1,
  sequence: 1,
};
function pendingHistory(kind: 'chats' | 'calls') {
  let finish!: (populated: boolean) => void;
  let fail!: (error: Error) => void;
  const promise = new Promise<boolean>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  if (kind === 'chats')
    mockEngine.chatPage.mockImplementationOnce(async () => ({
      rows: (await promise) ? [chat] : [],
      next: undefined,
    }));
  else mockEngine.callHistory.mockImplementationOnce(async () => ((await promise) ? [call] : []));
  return { finish, fail };
}
async function show(kind: 'chats' | 'calls') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const result = await render(
    <QueryClientProvider client={client}>
      {kind === 'chats' ? <ChatsScreen /> : <CallsScreen />}
    </QueryClientProvider>,
  );
  return { client, ...result };
}
const emptyText = {
  chats: 'Your conversations will appear here.',
  calls: 'No calls yet. Start a voice or video call with a saved contact.',
};

for (const kind of ['chats', 'calls'] as const) {
  test(`${kind} shows an accessible initial skeleton and keeps controls usable, then retains rows during refetch`, async () => {
    const initial = pendingHistory(kind);
    const { client } = await show(kind);
    expect(screen.getAllByRole('progressbar', { name: 'Loading…' })).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveProp('accessibilityState', { busy: true });
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByText(emptyText[kind])).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: kind === 'chats' ? 'New message' : 'New call' }),
    );
    expect(router.push).toHaveBeenCalledWith(kind === 'chats' ? '/new-message' : '/new-call');
    await act(() => initial.finish(true));
    await screen.findByText('Saved contact');
    expect(screen.queryByRole('progressbar')).toBeNull();
    const refresh = pendingHistory(kind);
    await act(() => {
      void client.invalidateQueries({
        queryKey: ['device', kind === 'chats' ? 'chats' : 'call-history'],
      });
    });
    expect(screen.getByText('Saved contact')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).toBeNull();
    await act(() => refresh.finish(true));
    await waitFor(() => expect(client.isFetching()).toBe(0));
  });

  test(`${kind} switches from the skeleton to a genuine empty state`, async () => {
    const pending = pendingHistory(kind);
    await show(kind);
    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
    await act(() => pending.finish(false));
    await screen.findByText(emptyText[kind]);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test(`${kind} replaces the skeleton with one retryable error, never a false empty state`, async () => {
    const pending = pendingHistory(kind);
    await show(kind);
    await act(() => pending.fail(new Error('LOCAL_READ_FAILED')));
    await screen.findByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(emptyText[kind])).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(emptyText[kind]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
}
