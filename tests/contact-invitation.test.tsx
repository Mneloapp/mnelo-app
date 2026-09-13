import { fireEvent, render, screen, act, waitFor } from '@testing-library/react-native';
import { ContactInvitationScreen } from '@/messenger/screens/ContactProfileScreen';
import { setInvitation } from '@/messenger/pending-invitation';
const mockTrust = jest.fn(async () => 'chat');
const mockContacts = jest.fn(async () => []);
let mockAuthenticated = false;
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: { trustContact: mockTrust, contacts: mockContacts },
    identity: { key: 'a'.repeat(64), name: 'Development A' },
    authenticated: mockAuthenticated,
  }),
}));
beforeEach(() => {
  mockAuthenticated = false;
  setInvitation({ key: 'b'.repeat(64), name: 'Development B' });
});
afterEach(() => setInvitation(null));
test('an unverified installation only sees a preview and registration action', async () => {
  await render(<ContactInvitationScreen />);
  expect(screen.getByRole('button', { name: 'Continue to Mnelo' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add contact' })).toBeNull();
  expect(mockTrust).not.toHaveBeenCalled();
  expect(mockContacts).not.toHaveBeenCalled();
});
test('each distinct invitation requires its own confirmation before adding', async () => {
  mockAuthenticated = true;
  await render(<ContactInvitationScreen />);
  expect(screen.getByRole('button', { name: 'Add contact' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Add contact' })).not.toBeDisabled();
  await act(() => setInvitation({ key: 'c'.repeat(64), name: 'Development C' }));
  expect(screen.getByRole('button', { name: 'Add contact' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox'));
  await fireEvent.press(screen.getByRole('button', { name: 'Add contact' }));
  await waitFor(() =>
    expect(mockTrust).toHaveBeenCalledWith({ key: 'c'.repeat(64), name: 'Development C' }),
  );
});
test('a blocked contact cannot be re-added from a QR code', async () => {
  mockAuthenticated = true;
  mockContacts.mockResolvedValueOnce([{ key: 'b'.repeat(64), blocked: true }] as never);
  await render(<ContactInvitationScreen />);
  await fireEvent.press(screen.getByRole('checkbox'));
  await fireEvent.press(screen.getByRole('button', { name: 'Add contact' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
  expect(mockTrust).not.toHaveBeenCalled();
});
