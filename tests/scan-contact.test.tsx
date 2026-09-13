import { AppState, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScanContactScreen } from '@/messenger/screens/ScanContactScreen';
import { invitationSnapshot, setInvitation } from '@/messenger/pending-invitation';
const mockFinish = jest.fn(),
  mockClose = jest.fn(),
  mockBack = jest.fn(),
  mockMyCode = jest.fn();
const mockPick = jest.fn();
let mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
const mockRequest = jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' }));
const mockRefresh = jest.fn(async () => mockPermission);
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
let mockBlur: (() => void) | undefined;
const valid = 'https://mnelo.com/invite#v1:' + 'ab'.repeat(32) + ':4e696e6f';
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: {
    canGoBack: () => true,
    back: () => mockBack(),
    dismissTo: (path: string) => mockMyCode(path),
  },
  useFocusEffect: (callback: () => () => void) =>
    jest.requireActual('react').useEffect(() => {
      mockBlur = callback();
      return mockBlur;
    }, []),
}));
jest.mock('@/messenger/screens/composer-navigation', () => ({
  useComposer: () => ({ finish: mockFinish, close: mockClose }),
}));
jest.mock('@/messenger/pick-contact-code', () => ({ pickContactCode: () => mockPick() }));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => {
    const React = jest.requireActual('react');
    const [permission, setPermission] = React.useState(mockPermission);
    const request = React.useCallback(async () => {
      const result = await mockRequest();
      setPermission(result);
      return result;
    }, []);
    const refresh = React.useCallback(async () => {
      const result = await mockRefresh();
      setPermission(result);
      return result;
    }, []);
    return [permission, request, refresh];
  },
  CameraView: (props: unknown) =>
    jest.requireActual('react').createElement(jest.requireActual('react-native').View, {
      ...(props as object),
      testID: 'qr-camera',
    }),
}));
beforeEach(() => {
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
  mockPick.mockResolvedValue({ cancelled: true });
  mockRequest.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  setInvitation(null);
});
test('Scan opens the camera directly with permission already granted', async () => {
  await render(<ScanContactScreen />);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(screen.getByTestId('qr-camera')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Open camera' })).toBeNull();
  expect(screen.queryByRole('textbox')).toBeNull();
});
test('first Scan entry requests camera permission once', async () => {
  mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
  await render(<ScanContactScreen />);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('qr-camera')).toBeVisible();
});
test('denied permission is not requested repeatedly and offers Settings', async () => {
  mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<ScanContactScreen />);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
  expect(settings).toHaveBeenCalledTimes(1);
  settings.mockRestore();
});
test('foreign QR is rejected, can retry, never opens a link or adds a contact', async () => {
  await render(<ScanContactScreen />);
  await fireEvent(screen.getByTestId('qr-camera'), 'barcodeScanned', {
    data: 'https://attacker.example/invite',
  });
  expect(mockFinish).not.toHaveBeenCalled();
  expect(invitationSnapshot()).toBeNull();
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Scan again' }));
  expect(screen.getByTestId('qr-camera')).toBeVisible();
});
test('valid scan previews once with camera stopped and no automatic trust', async () => {
  await render(<ScanContactScreen />);
  const onScan = screen.getByTestId('qr-camera').props.onBarcodeScanned;
  await act(async () => {
    onScan({ data: valid });
    onScan({ data: valid });
  });
  expect(mockFinish).toHaveBeenCalledTimes(1);
  expect(mockFinish).toHaveBeenCalledWith('/contact-invite');
  expect(invitationSnapshot()).toEqual({ key: 'ab'.repeat(32), name: 'Nino' });
  expect(screen.queryByTestId('qr-camera')).toBeNull();
});
test('backgrounding releases camera and torch; returning refreshes permission', async () => {
  let change: (state: AppStateStatus) => void = () => {};
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    change = callback;
    return { remove: jest.fn() };
  });
  await render(<ScanContactScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Turn flashlight on' }));
  expect(screen.getByTestId('qr-camera').props.enableTorch).toBe(true);
  const onScan = screen.getByTestId('qr-camera').props.onBarcodeScanned;
  await act(async () => {
    change('background');
    onScan({ data: valid });
  });
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  expect(mockFinish).not.toHaveBeenCalled();
  await act(async () => change('active'));
  expect(screen.getByTestId('qr-camera').props.enableTorch).toBe(false);
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  listener.mockRestore();
});
test('blur stops scanning and ignores late native callbacks', async () => {
  await render(<ScanContactScreen />);
  const onScan = screen.getByTestId('qr-camera').props.onBarcodeScanned;
  await act(async () => {
    mockBlur?.();
    onScan({ data: valid });
  });
  expect(mockFinish).not.toHaveBeenCalled();
  expect(screen.queryByTestId('qr-camera')).toBeNull();
});
test('photo picker pauses camera, cancellation resumes it', async () => {
  let resolve!: (value: unknown) => void;
  mockPick.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render(<ScanContactScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose a QR code from Photos' }));
  expect(mockPick).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  await act(async () => resolve({ cancelled: true }));
  expect(screen.getByTestId('qr-camera')).toBeVisible();
});
test('selected QR previews a contact while an unreadable photo offers retry', async () => {
  mockPick
    .mockResolvedValueOnce({ cancelled: false, data: null })
    .mockResolvedValueOnce({ cancelled: false, data: valid });
  await render(<ScanContactScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose a QR code from Photos' }));
  expect(screen.getByText('This is not a valid Mnelo contact code.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Choose a QR code from Photos' }));
  expect(mockFinish).toHaveBeenCalledTimes(1);
});
test('leaving for My code ignores an in-flight photo result', async () => {
  let resolve!: (value: unknown) => void;
  mockPick.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await render(<ScanContactScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Choose a QR code from Photos' }));
  await fireEvent.press(screen.getByRole('button', { name: 'My code' }));
  expect(mockMyCode).toHaveBeenCalledWith('/my-code');
  await act(async () => resolve({ cancelled: false, data: valid }));
  expect(mockFinish).not.toHaveBeenCalled();
});
test('manual link is a secondary sheet and waits for dismissal before navigating', async () => {
  await render(<ScanContactScreen />);
  const onScan = screen.getByTestId('qr-camera').props.onBarcodeScanned;
  await fireEvent.press(screen.getByRole('button', { name: 'Paste contact link' }));
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  await act(async () => onScan({ data: valid }));
  expect(mockFinish).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByDisplayValue(''), valid);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockFinish).not.toHaveBeenCalled();
  await act(async () => mockDismiss?.());
  expect(mockFinish).toHaveBeenCalledTimes(1);
});
