import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { EditProfileScreen } from '@/messenger/screens/LocalProfileScreen';
const mockSave = jest.fn(async () => undefined);
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: { saveProfile: mockSave },
    profile: { username: '', firstName: '', lastName: '' },
  }),
}));
test('Me profile permits optional names and normalizes a typed @username', async () => {
  await render(<EditProfileScreen />);
  expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Username'), '@Giorgi_qa');
  expect(screen.getByLabelText('Username')).toHaveDisplayValue('giorgi_qa');
  await fireEvent.changeText(screen.getByLabelText('First name (optional)'), 'გიორგი');
  await fireEvent.changeText(screen.getByLabelText('Last name (optional)'), 'დევდარიანი');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith({
      username: 'giorgi_qa',
      firstName: 'გიორგი',
      lastName: 'დევდარიანი',
      headline: '',
      about: '',
      email: '',
      website: '',
      avatar: '',
    }),
  );
  expect(router.back).toHaveBeenCalled();
});
test('invalid usernames do not save or navigate', async () => {
  await render(<EditProfileScreen />);
  await fireEvent.changeText(screen.getByLabelText('Username'), 'x!');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(mockSave).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

test('unsafe websites and malformed email cannot be saved, then valid optional details can', async () => {
  await render(<EditProfileScreen />);
  await fireEvent.changeText(screen.getByLabelText('Website'), 'javascript:alert(1)');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Website'), 'example.com');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Email'), 'hello@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'example.com', email: 'hello@example.com' }),
    ),
  );
});
