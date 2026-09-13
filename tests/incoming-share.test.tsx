import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IncomingShares, ShareReview } from '@/messenger/components/IncomingShares';
import { incomingItems, prepareIncoming, discardIncoming } from '@/messenger/incoming-share';
import type { SharePayload } from 'expo-sharing';
const mockSend = jest.fn<Promise<string>, [string, string, unknown]>(async () => 'sent');
let mockPayloads: SharePayload[] = [];
let mockAuthenticated = true;
const mockClear = jest.fn(() => {
  mockPayloads = [];
});
const mockResolve = jest.fn();
const mockDelete = jest.fn();
let mockSize = 100;
const mockChats = jest.fn(async () => ({
  rows: [
    { id: 'chat-a', title: 'Nino', left_group: 0 },
    { id: 'chat-b', title: 'Other', left_group: 0 },
    { id: 'left', title: 'Left group', left_group: 1 },
  ],
  next: undefined,
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    authenticated: mockAuthenticated,
    engine: { send: mockSend },
    view: {
      chatPage: mockChats,
      chat: async () => ({ id: 'chat-a', title: 'Nino', left_group: 0 }),
      members: async () => [{ key: 'own' }, { key: 'peer' }],
      contacts: async () => [{ key: 'peer', blocked: 0 }],
    },
  }),
}));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-sharing', () => ({
  getSharedPayloads: () => mockPayloads,
  clearSharedPayloads: () => mockClear(),
  getResolvedSharedPayloadsAsync: () => mockResolve(),
}));
jest.mock('expo-file-system', () => ({
  Paths: {
    cache: { uri: 'file:///app/cache/' },
    appleSharedContainers: { 'group.com.mnelo.messenger.sharing': { uri: 'file:///group/' } },
  },
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get size() {
      return mockSize;
    }
    exists = true;
    base64 = async () => 'YQ==';
    delete() {
      mockDelete(this.uri);
    }
  },
}));
jest.mock('@/features/chats/media-files', () => ({ discardCachedMedia: jest.fn() }));
const url: SharePayload = { shareType: 'url', value: 'https://maps.google.com/?q=41.7,44.8' };
const pdf: SharePayload = {
  shareType: 'file',
  value: 'file:///group/MneloIncoming/unique/notes.pdf',
  mimeType: 'application/pdf',
};
beforeEach(() => {
  mockPayloads = [];
  mockAuthenticated = true;
  mockSize = 100;
});
async function show(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
test('Maps links stay literal text without fetching; local files are validated and only owned copies are removed', async () => {
  const items = incomingItems([url, pdf]);
  expect(await prepareIncoming(items[0]!)).toEqual({ body: url.value, kind: 'text' });
  expect(await prepareIncoming(items[1]!)).toEqual({
    body: '',
    kind: 'file',
    media: { name: 'notes.pdf', mime: 'application/pdf', bytes: 'YQ==', duration: null },
  });
  expect(mockResolve).not.toHaveBeenCalled();
  discardIncoming([url, pdf, { ...pdf, value: 'file:///user/Photos/original.jpg' }]);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith(pdf.value);
  expect(() => incomingItems([{ ...url, value: 'javascript:alert(1)' }])).toThrow();
  expect(() =>
    incomingItems([{ ...pdf, value: 'file:///group/MneloIncoming/../../private.db' }]),
  ).toThrow();
  expect(() => incomingItems(Array(11).fill(url))).toThrow();
  mockSize = 11 * 1024 * 1024;
  expect(() => incomingItems([pdf])).toThrow();
});
test('receiving content requires unlocked identity, recipient selection and an explicit send', async () => {
  mockPayloads = [url];
  mockAuthenticated = false;
  const page = await show(<IncomingShares />);
  expect(screen.queryByText('Share with Mnelo')).toBeNull();
  expect(mockSend).not.toHaveBeenCalled();
  mockAuthenticated = true;
  await page.rerender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <IncomingShares />
    </QueryClientProvider>,
  );
  await screen.findByText('Nino');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(screen.queryByText('Left group')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Nino' }));
  expect(mockSend).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith('chat-a', url.value, { kind: 'text' }));
  await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));
  expect(mockResolve).not.toHaveBeenCalled();
});
test('partial failure retains recipient and retries only unsent items; cancelling never sends', async () => {
  const close = jest.fn();
  mockSend
    .mockResolvedValueOnce('first')
    .mockRejectedValueOnce(new Error('disk full'))
    .mockResolvedValueOnce('second');
  await show(
    <ShareReview
      items={incomingItems([url, { shareType: 'text', value: 'Hello' }])}
      onClose={close}
    />,
  );
  await screen.findByText('Nino');
  await fireEvent.press(screen.getByRole('button', { name: 'Nino' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await screen.findByRole('alert');
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Other' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(mockSend.mock.calls.map((call) => call.slice(0, 2))).toEqual([
    ['chat-a', url.value],
    ['chat-a', 'Hello'],
    ['chat-a', 'Hello'],
  ]);
});
test('closing a received file removes the temporary copy without sending', async () => {
  mockPayloads = [pdf];
  await show(<IncomingShares />);
  await screen.findByText('Nino');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith(pdf.value);
  expect(mockSend).not.toHaveBeenCalled();
});

test('a large original photo reaches review before compression; ordinary files still respect 10 MB', () => {
  mockSize = 14 * 1024 * 1024;
  expect(incomingItems([{ ...pdf, shareType: 'image', mimeType: 'image/png' }])[0]?.image).toBe(
    true,
  );
  expect(() => incomingItems([pdf])).toThrow('SHARE_FILE_SIZE');
  mockSize = 51 * 1024 * 1024;
  expect(() => incomingItems([{ ...pdf, shareType: 'image' }])).toThrow('SHARE_IMAGE_SIZE');
});

test('a system conversation suggestion preselects the recipient but never sends by itself', async () => {
  await show(
    <ShareReview items={incomingItems([url])} suggestedChat="chat-a" onClose={jest.fn()} />,
  );
  await screen.findByText('To: Nino');
  expect(mockSend).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(mockSend).toHaveBeenCalledWith('chat-a', url.value, { kind: 'text' }));
});
