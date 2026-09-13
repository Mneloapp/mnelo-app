import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { ContactDetails } from '@/features/privacy/ContactDetails';
const mockReveal = jest.fn<Promise<string | null>, [string]>();
let mockBlur: (() => void) | undefined;
let mockBackground: ((state: AppStateStatus) => void) | undefined;
jest.mock('@/services', () => ({
  repository: () => ({ mode: 'supabase', revealPhone: mockReveal }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => () => void) => {
    mockBlur = callback();
  },
}));
beforeEach(() => {
  jest.useFakeTimers();
  mockReveal.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'change') mockBackground = listener;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it('shows a deliberately requested number temporarily, then removes it', async () => {
  mockReveal.mockResolvedValue('+15555550102');
  await render(<ContactDetails target="development-peer" />);
  expect(mockReveal).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'View shared phone number' }));
  expect(screen.getByText('+15555550102')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(30000));
  expect(screen.queryByText('+15555550102')).toBeNull();
});
it('discards a late phone response after leaving the profile', async () => {
  let resolve: ((phone: string) => void) | undefined;
  mockReveal.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await render(<ContactDetails target="development-peer" />);
  await fireEvent.press(screen.getByRole('button', { name: 'View shared phone number' }));
  await act(() => mockBlur?.());
  await act(() => resolve?.('+15555550102'));
  expect(screen.queryByText('+15555550102')).toBeNull();
});
it('removes the displayed number when the app leaves the foreground', async () => {
  mockReveal.mockResolvedValue('+15555550102');
  await render(<ContactDetails target="development-peer" />);
  await fireEvent.press(screen.getByRole('button', { name: 'View shared phone number' }));
  expect(screen.getByText('+15555550102')).toBeOnTheScreen();
  await act(() => mockBackground?.('background'));
  expect(screen.queryByText('+15555550102')).toBeNull();
});
