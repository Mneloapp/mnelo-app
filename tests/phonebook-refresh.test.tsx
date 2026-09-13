import { AppState, type AppStateStatus } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppText } from '@/components/AppText';
import { usePhonebookNames } from '@/messenger/usePhonebookNames';
import { phonebookChanged } from '@/messenger/phonebook-events';
import type { DeviceMessenger } from '@/messenger/engine';
const mockRead = jest.fn(async () => new Map([['+12025550101', 'Local name']]));
let mockNativeChanged = () => {};
const mockNativeRemove = jest.fn();
jest.mock('@/messenger/phonebook', () => ({
  savedPhoneNames: (...args: unknown[]) => mockRead(...(args as [])),
  observeNativePhonebook: (listener: () => void) => {
    mockNativeChanged = listener;
    return mockNativeRemove;
  },
}));
let changed = () => {};
const unsubscribe = jest.fn();
const engine = {
  contacts: async () => [
    { key: 'peer', name: 'Saved alias', phone: '+12025550101', blocked: false },
  ],
  subscribe: (callback: () => void) => {
    changed = callback;
    return unsubscribe;
  },
} as unknown as DeviceMessenger;
function Names({ enabled = true }: { enabled?: boolean }) {
  const names = usePhonebookNames(engine, enabled, '+12025550102');
  return <AppText>{names.get('peer') ?? 'Saved alias'}</AppText>;
}
test('existing contacts refresh on resume/permission changes, not every message; access removal clears only the projection', async () => {
  let foreground: (state: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  const listen = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    foreground = listener;
    return { remove };
  });
  const result = await render(<Names />);
  await screen.findByText('Local name');
  expect(mockRead).toHaveBeenCalledTimes(1);
  await act(async () => {
    changed();
  });
  expect(mockRead).toHaveBeenCalledTimes(1);
  mockRead.mockResolvedValueOnce(new Map([['+12025550101', 'Renamed in Contacts']]));
  await act(async () => {
    mockNativeChanged();
  });
  await screen.findByText('Renamed in Contacts');
  mockRead.mockResolvedValueOnce(new Map([['+12025550101', 'Name after returning']]));
  await act(async () => {
    foreground('active');
  });
  await screen.findByText('Name after returning');
  mockRead.mockResolvedValueOnce(new Map());
  await act(async () => {
    phonebookChanged();
  });
  await screen.findByText('Saved alias');
  expect(mockRead).toHaveBeenCalledTimes(4);
  await result.rerender(<Names enabled={false} />);
  expect(screen.getByText('Saved alias')).toBeOnTheScreen();
  await result.unmount();
  await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  expect(remove).toHaveBeenCalled();
  expect(mockNativeRemove).toHaveBeenCalled();
  listen.mockRestore();
});

test('a native contact change queued during a failed read is still applied without restarting the app', async () => {
  const listen = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  let failRead = (_error: Error) => {};
  mockRead.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        failRead = reject;
      }),
  );
  const result = await render(<Names />);
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1));
  mockRead.mockResolvedValueOnce(new Map([['+12025550101', 'Recovered contact name']]));
  await act(async () => {
    mockNativeChanged();
    failRead(new Error('Contacts temporarily unavailable'));
  });
  await screen.findByText('Recovered contact name');
  expect(mockRead).toHaveBeenCalledTimes(2);
  await result.unmount();
  listen.mockRestore();
});
