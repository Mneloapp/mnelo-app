import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExportChatAction } from '@/messenger/components/ExportChatAction';
import { GroupScreen } from '@/messenger/screens/GroupScreen';
import { exportChat } from '@/messenger/export-chat';

let mockFocused = true;
let mockEngine = {};
const mockView = {
  chat: async () => ({ kind: 'group', title: 'Weekend', owner: 'someone', left_group: 1 }),
  members: async () => [],
  contacts: async () => [],
};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  useLocalSearchParams: () => ({ id: 'group-chat' }),
  router: { canGoBack: () => true, back: jest.fn() },
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: mockEngine, view: mockView, identity: { key: 'self' } }),
}));
jest.mock('@/messenger/export-chat', () => ({ exportChat: jest.fn(async () => {}) }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);

beforeEach(() => {
  mockFocused = true;
  mockEngine = {};
  jest.mocked(exportChat).mockResolvedValue(undefined);
});

test('export is explicit, stays busy while preparing, and share cancellation returns to the action without an error', async () => {
  let finish!: () => void;
  jest.mocked(exportChat).mockImplementationOnce(async (_engine, _view, _chat, options) => {
    expect(options?.isCurrent?.()).toBe(true);
    await new Promise<void>((resolve) => (finish = resolve));
  });
  await render(<ExportChatAction chatId="direct" />);
  expect(exportChat).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Export chat' }));
  const preparing = screen.getByRole('button', { name: 'Preparing export…' });
  expect(preparing).toBeDisabled();
  await fireEvent.press(preparing);
  expect(exportChat).toHaveBeenCalledTimes(1);
  await act(() => finish());
  expect(screen.getByRole('button', { name: 'Export chat' })).not.toBeDisabled();
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each(['blur', 'chat', 'account', 'unmount'] as const)(
  'an export in preparation becomes permanently stale after %s',
  async (change) => {
    let isCurrent!: () => boolean;
    let finish!: () => void;
    jest.mocked(exportChat).mockImplementationOnce(async (_engine, _view, _chat, options) => {
      isCurrent = options!.isCurrent!;
      await new Promise<void>((resolve) => (finish = resolve));
    });
    const result = await render(<ExportChatAction chatId="direct" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Export chat' }));
    expect(isCurrent()).toBe(true);
    if (change === 'blur') mockFocused = false;
    if (change === 'account') mockEngine = {};
    if (change === 'unmount') await result.unmount();
    else
      await result.rerender(<ExportChatAction chatId={change === 'chat' ? 'other' : 'direct'} />);
    expect(isCurrent()).toBe(false);
    if (change === 'blur') {
      mockFocused = true;
      await result.rerender(<ExportChatAction chatId="direct" />);
      expect(isCurrent()).toBe(false);
    }
    await act(() => finish());
  },
);

test('export failures stay on the current info page and expose a retryable localized error', async () => {
  jest.mocked(exportChat).mockRejectedValueOnce(new Error('FILE_WRITE_FAILED'));
  await render(<ExportChatAction chatId="direct" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Export chat' }));
  expect(screen.getByRole('alert')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Export chat' })).not.toBeDisabled();
});

test('group info exports the selected group history even after leaving it', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <GroupScreen />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Export chat' }));
  expect(exportChat).toHaveBeenCalledWith(mockEngine, mockView, 'group-chat', expect.any(Object));
});
