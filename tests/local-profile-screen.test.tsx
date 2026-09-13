import jpeg from 'jpeg-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { EditProfileScreen } from '@/messenger/screens/LocalProfileScreen';
import { ProfileFieldEditor, ProfileFieldScreen } from '@/messenger/screens/ProfileFieldScreen';
import { MeScreen } from '@/messenger/screens/MeScreen';
import { localProfile } from '@/messenger/local-profile';
let mockDismiss: (() => void) | undefined;
jest.mock('@/components/ActionSheet', () => {
  const { ActionSheet: Actual } = jest.requireActual('@/components/ActionSheet');
  return {
    ActionSheet: (props: import('react').ComponentProps<typeof Actual>) => {
      mockDismiss = props.onDismiss;
      return <Actual {...props} />;
    },
  };
});

const initialProfile = () =>
  localProfile.parse({
    username: '',
    firstName: 'Nino',
    lastName: 'Test',
    about: 'Outside with friends.',
    website: 'example.com',
  });
let mockProfile = initialProfile();
let mockField: unknown = 'name';
const mockSave = jest.fn(async () => undefined);
const mockPickPhoto = jest.fn<Promise<string | null>, []>(async () => null);
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ field: mockField }),
  Redirect: () => null,
}));
jest.mock('@/messenger/pick-profile-photo', () => ({ pickProfilePhoto: () => mockPickPhoto() }));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: { saveProfile: mockSave, currentProfile: () => mockProfile },
    profile: mockProfile,
    enrollment: { phone: '+995555010203' },
  }),
}));
beforeEach(() => {
  mockProfile = initialProfile();
  mockField = 'name';
  mockPickPhoto.mockResolvedValue(null);
});

test('Me identity opens profile, where individual details and the verified-number flow are accessible', async () => {
  const page = await render(<MeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Profile: Nino Test' }));
  expect(router.push).toHaveBeenCalledWith('/edit-profile');
  await page.unmount();
  await render(<EditProfileScreen />);
  expect(screen.queryByLabelText('First name (optional)')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Name: Nino Test' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/edit-profile-field',
    params: { field: 'name' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Phone number: +995555010203' }));
  expect(router.push).toHaveBeenCalledWith('/phone');
  expect(mockSave).not.toHaveBeenCalled();
});

test('name editing saves only changed name fields and preserves newer unedited details', async () => {
  await render(<ProfileFieldEditor field="name" />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('First name (optional)'), 'გიორგი');
  await fireEvent.changeText(screen.getByLabelText('Last name (optional)'), 'დევდარიანი');
  mockProfile = { ...mockProfile, about: 'Changed while the editor was open.' };
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      ...mockProfile,
      firstName: 'გიორგი',
      lastName: 'დევდარიანი',
    }),
  );
  expect(router.back).toHaveBeenCalled();
});

test('usernames normalize @ and casing; invalid values cannot save', async () => {
  await render(<ProfileFieldEditor field="username" />);
  await fireEvent.changeText(screen.getByLabelText('Username'), 'x!');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Username'), '@Giorgi_qa');
  expect(screen.getByLabelText('Username')).toHaveDisplayValue('giorgi_qa');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({ ...mockProfile, username: 'giorgi_qa' }),
  );
});

test('unsafe links and malformed email cannot save; failed save retains the draft', async () => {
  await render(<ProfileFieldEditor field="links" />);
  await fireEvent.changeText(screen.getByLabelText('Website'), 'javascript:alert(1)');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Website'), 'example.org');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Email'), 'hello@example.com');
  mockSave.mockRejectedValueOnce(new Error('disk unavailable'));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
  expect(screen.getByLabelText('Email')).toHaveDisplayValue('hello@example.com');
  expect(router.back).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(mockSave).toHaveBeenLastCalledWith({
    ...mockProfile,
    website: 'example.org',
    email: 'hello@example.com',
  });
});

test('back discards a changed About draft without saving', async () => {
  await render(<ProfileFieldEditor field="about" />);
  await fireEvent.changeText(screen.getByLabelText('Short description'), 'Available later');
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(router.back).toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});

test('photo menu dismisses outside and cancelling the picker keeps the current profile', async () => {
  await render(<EditProfileScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  expect(mockPickPhoto).not.toHaveBeenCalled();
  await act(async () => mockDismiss?.());
  await waitFor(() => expect(mockPickPhoto).toHaveBeenCalledTimes(1));
  expect(mockSave).not.toHaveBeenCalled();
});

test.each(['avatar', ['name'], '__proto__'])(
  'invalid editor route %s does not expose a form',
  async (field) => {
    mockField = field;
    await render(<ProfileFieldScreen />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
  },
);

test('removing a profile photo then choosing a new one waits for dismissal and can retry after picker failure', async () => {
  mockProfile = {
    ...mockProfile,
    avatar: Buffer.from(
      jpeg.encode({ width: 4, height: 4, data: Buffer.alloc(64, 255) }, 60).data,
    ).toString('base64'),
  };
  const page = await render(<EditProfileScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith({ ...mockProfile, avatar: '' }));
  mockProfile = { ...mockProfile, avatar: '' };
  await page.rerender(<EditProfileScreen />);
  mockPickPhoto.mockRejectedValueOnce(new Error('picker failed'));
  await fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  expect(mockPickPhoto).not.toHaveBeenCalled();
  await act(async () => mockDismiss?.());
  await waitFor(() => expect(screen.getByRole('alert')).toBeOnTheScreen());
  mockPickPhoto.mockResolvedValueOnce('new-photo');
  await fireEvent.press(screen.getByRole('button', { name: 'Edit photo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  await act(async () => mockDismiss?.());
  await waitFor(() =>
    expect(mockSave).toHaveBeenLastCalledWith({ ...mockProfile, avatar: 'new-photo' }),
  );
  await act(async () => mockDismiss?.());
  expect(mockPickPhoto).toHaveBeenCalledTimes(2);
});
