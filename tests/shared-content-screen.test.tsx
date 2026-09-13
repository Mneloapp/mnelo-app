import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SharedContentScreen } from '@/messenger/screens/SharedContentScreen';
import type { ContentTab } from '@/messenger/shared-content';
const mockItem = {
  id: 'document',
  sequence: 1,
  sentAt: 1,
  body: '',
  attachment: 'attachment',
  name: 'notes.pdf',
  mime: 'application/pdf',
  duration: null,
};
const mockMedia = jest.fn(async () => ({
  name: '../../notes.pdf',
  mime: 'application/pdf',
  bytes: 'YQ==',
  duration: null,
}));
const mockShare = jest.fn(async () => {});
const mockWrite = jest.fn();
const mockDiscard = jest.fn();
const mockContent = jest.fn(async (_id: string, tab: ContentTab) => ({
  items:
    tab === 'docs'
      ? [mockItem]
      : tab === 'links'
        ? [{ ...mockItem, id: 'link', attachment: null, url: 'https://example.com/' }]
        : [],
  next: undefined,
}));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'chat' }),
  router: { canGoBack: () => true, back: jest.fn() },
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: { media: mockMedia, sharedContent: mockContent },
    view: { chat: async () => ({ id: 'chat', title: 'Fixture friend' }) },
  }),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri: string;
    constructor(_path: string, name: string) {
      this.uri = 'cache/' + name;
    }
    write = mockWrite;
  },
}));
jest.mock('expo-sharing', () => ({
  shareAsync: (...args: unknown[]) => mockShare(...(args as [])),
}));
jest.mock('@/features/chats/media-files', () => ({
  discardCachedMedia: (...args: unknown[]) => mockDiscard(...args),
}));
async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <SharedContentScreen />
    </QueryClientProvider>,
  );
  await screen.findByText('Photos and videos shared in this chat will appear here.');
}
test('tabs show only their own category and never open or read files on navigation', async () => {
  await show();
  await fireEvent.press(screen.getByRole('tab', { name: 'Links' }));
  await screen.findByRole('link', { name: 'https://example.com/' });
  await fireEvent.press(screen.getByRole('tab', { name: 'Docs' }));
  await screen.findByRole('button', { name: 'Open file: notes.pdf' });
  expect(screen.queryByRole('link', { name: 'https://example.com/' })).toBeNull();
  expect(mockContent).toHaveBeenLastCalledWith('chat', 'docs', Number.MAX_SAFE_INTEGER);
  expect(mockMedia).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});
test('opening a document loads only that attachment, shares a safe cached path and cleans up afterwards', async () => {
  await show();
  await fireEvent.press(screen.getByRole('tab', { name: 'Docs' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Open file: notes.pdf' }));
  await waitFor(() => expect(mockDiscard).toHaveBeenCalledTimes(1));
  expect(mockMedia).toHaveBeenCalledWith('attachment');
  expect(mockShare).toHaveBeenCalledWith(
    expect.stringMatching(/^cache\/mnelo-shared-\d+-[^/]+\.pdf$/),
    { mimeType: 'application/pdf' },
  );
  expect(mockWrite).toHaveBeenCalledWith(Uint8Array.of(97));
});
