import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoGallery } from '@/messenger/components/PhotoGallery';
import type { SharedPage } from '@/messenger/shared-content';
const mockItems = [1, 2, 3].map((sequence) => ({
  id: 'photo' + sequence,
  sequence,
  sentAt: sequence * 60000,
  body: '',
  attachment: 'asset' + sequence,
  name: 'photo' + sequence + '.png',
  mime: 'image/png',
  duration: null,
}));
const mockPage = jest.fn<Promise<SharedPage>, [string, number, string]>(
  async (_chat, _cursor, direction) => ({
    items: direction === 'before' ? mockItems.slice(0, 2).reverse() : mockItems.slice(2),
    next: undefined,
  }),
);
const mockMedia = jest.fn(async (attachment: string) => ({
  name: attachment + '.png',
  mime: 'image/png',
  bytes: 'YQ==',
  duration: null,
}));
const mockShare = jest.fn<Promise<void>, [string]>(async () => {});
const mockDiscard = jest.fn();
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: { photoPage: mockPage, media: mockMedia } }),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri: string;
    constructor(_path: string, name: string) {
      this.uri = 'cache/' + name;
    }
    write = jest.fn();
  },
}));
jest.mock('expo-sharing', () => ({ shareAsync: (uri: string) => mockShare(uri) }));
jest.mock('@/features/chats/media-files', () => ({
  discardCachedMedia: (uri: string) => mockDiscard(uri),
}));
async function show() {
  const close = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <PhotoGallery
        source={{ id: 'photo2', chatId: 'chat', sequence: 2, sentAt: 120000, attachment: 'asset2' }}
        name="photo2.png"
        onClose={close}
      />
    </QueryClientProvider>,
  );
  await fireEvent(screen.getByTestId('gallery-strip'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 60 } },
  });
  await waitFor(() => expect(mockPage).toHaveBeenCalledTimes(2));
  await fireEvent(screen.getByTestId('gallery-strip'), 'contentSizeChange', 180, 60);
  await screen.findByTestId('gallery-thumbnail-photo3');
  await fireEvent(screen.getByTestId('gallery-viewport'), 'layout', {
    nativeEvent: { layout: { width: 320, height: 500 } },
  });
  return close;
}
test('opened photo remains selected after both metadata windows arrive; swipes and thumbnails change the shared photo', async () => {
  await show();
  expect(mockPage).toHaveBeenCalledWith('chat', 3, 'before');
  expect(mockPage).toHaveBeenCalledWith('chat', 2, 'after');
  expect(screen.getByTestId('gallery-thumbnail-photo2')).toBeSelected();
  await fireEvent(screen.getByTestId('gallery-pager'), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: 640 } },
  });
  expect(screen.getByTestId('gallery-thumbnail-photo3')).toBeSelected();
  await fireEvent.press(screen.getByRole('button', { name: 'Save or share photo' }));
  await waitFor(() =>
    expect(mockShare).toHaveBeenCalledWith(expect.stringContaining('asset3.png')),
  );
  expect(mockDiscard).toHaveBeenCalledWith(expect.stringContaining('asset3.png'));
  await fireEvent.press(screen.getByTestId('gallery-thumbnail-photo1'));
  expect(screen.getByRole('button', { name: 'Previous photo' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Next photo' }));
  expect(screen.getByTestId('gallery-thumbnail-photo2')).toBeSelected();
});
test('sharing locks photo selection until the selected file is released; close stays reachable', async () => {
  let finish!: () => void;
  mockShare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const close = await show();
  await fireEvent.press(screen.getByRole('button', { name: 'Save or share photo' }));
  await waitFor(() => expect(mockShare).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Next photo' })).toBeDisabled();
  expect(screen.getByTestId('gallery-thumbnail-photo1')).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
