import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { GroupScreen } from '@/messenger/screens/GroupScreen';
import { EditGroupScreen } from '@/messenger/screens/EditGroupScreen';
import { GroupMembersScreen } from '@/messenger/screens/GroupMembersScreen';

let mockOwner = 'self';
const mockEngine = {
  currentIdentity: () => ({ key: 'self' }),
  contactProfile: async () => null,
  chat: async () => ({
    id: 'group',
    kind: 'group',
    title: 'Family',
    owner: mockOwner,
    left_group: 0,
  }),
  members: async () => [
    { key: 'self', name: 'Me' },
    { key: 'peer', name: 'Friend' },
  ],
  contacts: async () => [
    { key: 'peer', name: 'Friend', blocked: false },
    { key: 'new', name: 'New friend', blocked: false },
    { key: 'blocked', name: 'Blocked', blocked: true },
  ],
  changeGroupMembers: jest.fn(async () => {}),
  editGroupProfile: jest.fn(async () => {}),
};
jest.mock('@/messenger/export-chat', () => ({ exportChat: jest.fn(async () => {}) }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'group' }),
  useIsFocused: () => true,
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: mockEngine,
    view: mockEngine,
    identity: { key: 'self', name: 'Me' },
  }),
}));
jest.mock('@/messenger/screens/CallActions', () => ({ useCurrentCall: () => null }));
jest.mock('@/messenger/pick-profile-photo', () => ({ pickProfilePhoto: async () => null }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
async function show(child: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}
beforeEach(() => {
  mockOwner = 'self';
});
test('group opens as info; edit and membership are separate destinations and removal requires confirmation', async () => {
  await show(<GroupScreen />);
  await screen.findByText('Family');
  expect(screen.queryByLabelText('Group name')).toBeNull();
  await fireEvent.press(screen.getAllByRole('button', { name: 'Edit group' })[0]!);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/edit-group/[id]',
    params: { id: 'group' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Add members' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/group-members/[id]',
    params: { id: 'group' },
  });
  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Friend' }));
  expect(mockEngine.changeGroupMembers).not.toHaveBeenCalled();
  await act(async () => {
    alert.mock.calls.at(-1)![2]!.find((button) => button.style === 'destructive')!.onPress!();
  });
  await waitFor(() =>
    expect(mockEngine.changeGroupMembers).toHaveBeenCalledWith('group', { remove: 'peer' }),
  );
});
test('non-admin sees members and has no edit/add/remove controls', async () => {
  mockOwner = 'peer';
  await show(<GroupScreen />);
  await screen.findByText('Friend');
  expect(screen.queryByRole('button', { name: 'Edit group' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add members' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove Friend' })).toBeNull();
});
test('profile edits submit only profile fields, never a stale membership selection', async () => {
  await show(<EditGroupScreen />);
  const field = await screen.findByLabelText('Group name');
  await fireEvent.changeText(field, 'Family renamed');
  await fireEvent.press(screen.getByRole('button', { name: 'Save group' }));
  await waitFor(() =>
    expect(mockEngine.editGroupProfile).toHaveBeenCalledWith(
      'group',
      'Family renamed',
      expect.any(Object),
    ),
  );
  expect(mockEngine.changeGroupMembers).not.toHaveBeenCalled();
});
test('member picker excludes existing and blocked members and sends additions only', async () => {
  await show(<GroupMembersScreen />);
  await screen.findByRole('checkbox', { name: 'New friend' });
  expect(screen.queryByRole('checkbox', { name: 'Friend' })).toBeNull();
  expect(screen.queryByText('Blocked')).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'New friend' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add members' }));
  await waitFor(() =>
    expect(mockEngine.changeGroupMembers).toHaveBeenCalledWith('group', { add: ['new'] }),
  );
});
