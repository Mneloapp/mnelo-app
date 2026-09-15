import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from 'react-native';
import jpeg from 'jpeg-js';
import { NewGroupScreen, NewGroupDetailsScreen } from '@/messenger/screens/NewGroupScreens';
import { GroupDraftProvider } from '@/messenger/screens/group-draft';
import { router } from 'expo-router';
import type { Contact } from '@/messenger/model';

let mockNavigate: (details: boolean) => void;
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn((path) => {
      if (path === '/new-group-details') mockNavigate(true);
    }),
    dismissTo: jest.fn(),
  },
  Stack: {
    Screen: ({
      options,
    }: {
      options: { headerLeft?: () => React.ReactNode; headerRight?: () => React.ReactNode };
    }) => (
      <>
        {options.headerLeft?.()}
        {options.headerRight?.()}
      </>
    ),
  },
}));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
const alice = { key: 'a'.repeat(64), name: 'ანი', blocked: false };
const bob = { key: 'b'.repeat(64), name: 'გიორგი', blocked: false };
const mockEngine = {
  contacts: jest.fn(async (): Promise<Contact[]> => [
    alice,
    bob,
    { key: 'c'.repeat(64), name: 'Blocked', blocked: true },
  ]),
  contactProfile: jest.fn(async () => null),
  createGroup: jest.fn(async () => 'group-id'),
  trustPhoneContact: jest.fn(),
};
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: mockEngine, view: mockEngine, identity: { key: 'd'.repeat(64) } }),
}));
jest.mock('@/messenger/screens/phone-shared', () => ({
  usePhoneService: () => ({ client: null, status: { data: { registered: false } } }),
}));
const mockPickPhoto = jest.fn<Promise<string | null>, []>(async () => null);
jest.mock('@/messenger/pick-profile-photo', () => ({ pickProfilePhoto: () => mockPickPhoto() }));
function Flow() {
  const [details, setDetails] = useState(false);
  useEffect(() => {
    mockNavigate = setDetails;
  }, []);
  return (
    <GroupDraftProvider>
      {details ? (
        <>
          <Button title="Back to members" onPress={() => setDetails(false)} />
          <NewGroupDetailsScreen />
        </>
      ) : (
        <NewGroupScreen />
      )}
    </GroupDraftProvider>
  );
}
async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <Flow />
    </QueryClientProvider>,
  );
  await screen.findByRole('checkbox', { name: 'ანი' });
}
test('members come first; searching and going back preserve selection and details before creation', async () => {
  await show();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.queryByLabelText('Group name')).toBeNull();
  expect(screen.queryByText('Blocked')).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'ანი' }));
  await fireEvent.changeText(screen.getByLabelText('Search name or number'), 'გიო');
  await screen.findByRole('checkbox', { name: 'გიორგი' });
  expect(screen.queryByRole('checkbox', { name: 'ანი' })).toBeNull();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'გიორგი' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Create group' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Group name'), 'მეგობრები');
  await fireEvent.changeText(screen.getByLabelText('Group description'), 'შაბათის გეგმები');
  await fireEvent.press(screen.getByRole('button', { name: 'Back to members' }));
  expect(
    (await screen.findByRole('checkbox', { name: 'ანი' })).props.accessibilityState.checked,
  ).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'გიორგი' }).props.accessibilityState.checked).toBe(
    true,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByLabelText('Group name')).toHaveDisplayValue('მეგობრები');
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  await waitFor(() =>
    expect(mockEngine.createGroup).toHaveBeenCalledWith(
      'მეგობრები',
      [alice.key, bob.key],
      expect.objectContaining({ about: 'შაბათის გეგმები' }),
    ),
  );
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/chats');
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/chat/[id]',
    params: { id: 'group-id' },
  });
});
test('photo preparation and invalid details prevent creation; failed save keeps the draft for retry', async () => {
  await show();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'ანი' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await fireEvent.changeText(screen.getByLabelText('Group name'), 'Photos');
  let resolvePhoto!: (photo: string) => void;
  mockPickPhoto.mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePhoto = resolve;
    }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  expect(screen.getByRole('button', { name: 'Create group' })).toBeDisabled();
  const avatar = Buffer.from(
    jpeg.encode({ width: 4, height: 4, data: Buffer.alloc(64, 255) }, 60).data,
  ).toString('base64');
  await act(async () => resolvePhoto(avatar));
  await fireEvent.press(screen.getByRole('button', { name: 'Additional information' }));
  await fireEvent.changeText(screen.getByLabelText('Website'), 'javascript:alert(1)');
  expect(screen.getByRole('button', { name: 'Create group' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Website'), 'example.com');
  mockEngine.createGroup.mockRejectedValueOnce(new Error('save failed'));
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Group name')).toHaveDisplayValue('Photos');
  expect(router.dismissTo).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create group' }));
  await waitFor(() => expect(router.dismissTo).toHaveBeenCalled());
  expect(mockEngine.createGroup).toHaveBeenLastCalledWith(
    'Photos',
    [alice.key],
    expect.objectContaining({ avatar, website: 'example.com' }),
  );
});
