import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScanContactScreen } from '@/messenger/screens/ScanContactScreen';
import { invitationSnapshot, setInvitation } from '@/messenger/pending-invitation';
const mockFinish = jest.fn();
let mockPermission = { granted: false, canAskAgain: true };
const mockRequest = jest.fn(async () => {
  mockPermission = { granted: true, canAskAgain: true };
  return mockPermission;
});
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, []),
}));
jest.mock('@/messenger/screens/composer-navigation', () => ({
  useComposer: () => ({ finish: mockFinish }),
}));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockPermission, mockRequest],
  CameraView: (props: unknown) =>
    jest.requireActual('react').createElement(jest.requireActual('react-native').View, {
      ...(props as object),
      testID: 'qr-camera',
    }),
}));
beforeEach(() => {
  AppState.currentState = 'active';
  mockPermission = { granted: false, canAskAgain: true };
  setInvitation(null);
});
test('camera permission is requested only after the user asks to scan', async () => {
  await render(<ScanContactScreen />);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open camera' }));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('qr-camera')).toBeVisible();
});
test('foreign QR is rejected without opening it or silently adding a contact', async () => {
  await render(<ScanContactScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open camera' }));
  await fireEvent(screen.getByTestId('qr-camera'), 'barcodeScanned', {
    data: 'https://attacker.example/invite',
  });
  expect(mockFinish).not.toHaveBeenCalled();
  expect(invitationSnapshot()).toBeNull();
  expect(screen.queryByTestId('qr-camera')).toBeNull();
});
test('valid scan previews once, with camera stopped and no automatic trust', async () => {
  await render(<ScanContactScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open camera' }));
  const onScan = screen.getByTestId('qr-camera').props.onBarcodeScanned;
  await act(async () => {
    onScan({ data: 'https://mnelo.com/invite#v1:' + 'ab'.repeat(32) + ':4e696e6f' });
    onScan({ data: 'https://mnelo.com/invite#v1:' + 'ab'.repeat(32) + ':4e696e6f' });
  });
  expect(mockFinish).toHaveBeenCalledTimes(1);
  expect(mockFinish).toHaveBeenCalledWith('/contact-invite');
  expect(invitationSnapshot()).toEqual({ key: 'ab'.repeat(32), name: 'Nino' });
  expect(screen.queryByTestId('qr-camera')).toBeNull();
});
