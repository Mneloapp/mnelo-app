import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { PhoneScreen } from '@/messenger/screens/PhoneScreen';
import { PhonePrivacySection } from '@/messenger/screens/PhonePrivacySection';
import { FindPhoneScreen } from '@/messenger/screens/FindPhoneScreen';
import type { PhoneCommand, PhoneResponse } from '@/messenger/phone-protocol';
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
}));
const mockEngine = {
  currentIdentity: () =>
    mockHasIdentity
      ? { key: 'a'.repeat(64), secret: 'test-only', name: 'Development Alice' }
      : null,
  phoneNumber: jest.fn(async () => null),
  createIdentity: jest.fn(async () => {
    mockHasIdentity = true;
  }),
  completePhoneEnrollment: jest.fn(async () => undefined),
  rememberPhone: jest.fn(async () => undefined),
  contacts: jest.fn(async () => []),
  trustContact: jest.fn(async () => 'development-chat'),
  trustPhoneContact: jest.fn(async () => 'development-chat'),
};
let mockRegistered = false;
let mockDiscoverable = true;
let mockHasIdentity = true;
let mockReview = false;
let mockService = 'http://127.0.0.1:8087';
const mockClient = {
  execute: jest.fn(async (command: PhoneCommand): Promise<PhoneResponse> => {
    if (command.action === 'status')
      return { registered: mockRegistered, discoverable: mockDiscoverable };
    if (command.action === 'send')
      return {
        attempt: '11111111-1111-4111-8111-111111111111',
        expires: Date.now() + 600000,
        retryAt: Date.now() + 60000,
        testOnly: true,
        ...(mockReview ? { reviewAccount: true as const } : {}),
      };
    if (command.action === 'verify') {
      if (command.code !== (mockReview ? '2'.repeat(32) : '864209'))
        throw new Error('PHONE_CODE_INVALID');
      return { registered: true, discoverable: true };
    }
    if (command.action === 'visibility') mockDiscoverable = command.discoverable;
    if (command.action === 'lookup') return { key: 'b'.repeat(64) };
    return { ok: true };
  }),
};
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: mockEngine, identity: mockEngine.currentIdentity() }),
}));
jest.mock('@/messenger/phone-client', () => ({
  devicePhoneClient: () => mockClient,
  configuredPhoneService: () => mockService,
}));
async function show(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  mockRegistered = false;
  mockDiscoverable = true;
  mockHasIdentity = true;
  mockReview = false;
  mockService = 'http://127.0.0.1:8087';
});
test('registration splits a full-number paste and never claims success after an invalid OTP', async () => {
  await show(<PhoneScreen />);
  const number = await screen.findByLabelText('Mobile number');
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await fireEvent.changeText(number, '+12025550101');
  expect(screen.getByRole('button', { name: 'Country. United States +1' })).toBeOnTheScreen();
  expect(number).toHaveDisplayValue('2025550101');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  const code = await screen.findByLabelText('6-digit SMS code');
  expect(screen.getByText(/Development test only/)).toBeOnTheScreen();
  await fireEvent.changeText(code, '000000');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify number' }));
  await screen.findByText('The code is incorrect. Try again.');
  expect(mockEngine.completePhoneEnrollment).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  await fireEvent.changeText(code, '864209');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify number' }));
  await waitFor(() =>
    expect(mockEngine.completePhoneEnrollment).toHaveBeenCalledWith(
      {
        phone: '+12025550101',
        service: 'http://127.0.0.1:8087',
        testOnly: true,
        verifiedAt: expect.any(Number),
      },
      'a'.repeat(64),
    ),
  );
  expect(mockClient.execute).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'verify', discoverable: true }),
  );
  expect(router.replace).toHaveBeenCalledWith('/(tabs)/chats');
});
test('registration defaults to Georgia and sends the national number with its calling code', async () => {
  await show(<PhoneScreen />);
  expect(await screen.findByRole('button', { name: 'Country. Georgia +995' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '555 01 01 01');
  expect(mockClient.execute).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'send' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() =>
    expect(mockClient.execute).toHaveBeenCalledWith({ action: 'send', phone: '+995555010101' }),
  );
});
test('country search selects a new calling code and revalidates the number without sending automatically', async () => {
  await show(<PhoneScreen />);
  const number = await screen.findByLabelText('Mobile number');
  await fireEvent.changeText(number, '555010101');
  await fireEvent.press(screen.getByRole('button', { name: 'Country. Georgia +995' }));
  await fireEvent.changeText(screen.getByLabelText('Search'), 'United States');
  await fireEvent.press(screen.getByRole('button', { name: 'United States. +1' }));
  expect(screen.getByRole('button', { name: 'Country. United States +1' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(screen.getByLabelText('Mobile number')).toHaveDisplayValue('555010101');
  expect(mockClient.execute).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'send' }));
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '2025550101');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() =>
    expect(mockClient.execute).toHaveBeenCalledWith({ action: 'send', phone: '+12025550101' }),
  );
});
test('closing country search keeps the selection and clears stale search when reopened', async () => {
  await show(<PhoneScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Country. Georgia +995' }));
  await fireEvent.changeText(screen.getByLabelText('Search'), 'not-a-country');
  expect(screen.getByText('No countries found.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Country. Georgia +995' }));
  expect(screen.getByLabelText('Search')).toHaveDisplayValue('');
  await fireEvent.changeText(screen.getByLabelText('Search'), '+995');
  expect(screen.getByRole('button', { name: 'Georgia. +995', selected: true })).toBeOnTheScreen();
  expect(mockClient.execute).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'send' }));
});
test('number search requires own phone verification', async () => {
  await show(<FindPhoneScreen />);
  await screen.findByText('Verify your own number before using number search.');
  expect(screen.queryByRole('button', { name: 'Find person' })).toBeNull();
});
test('a found number previews without trusting, and one explicit Message action saves its phone/key', async () => {
  mockRegistered = true;
  await show(<FindPhoneScreen />);
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+12025550102');
  await fireEvent.press(screen.getByRole('button', { name: 'Find person' }));
  await screen.findByText('On Mnelo');
  expect(screen.getByText('+12025550102')).toBeOnTheScreen();
  expect(screen.queryByText('mnelo1:' + 'b'.repeat(64))).toBeNull();
  expect(mockEngine.trustPhoneContact).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Message' }));
  await waitFor(() =>
    expect(mockEngine.trustPhoneContact).toHaveBeenCalledWith({
      key: 'b'.repeat(64),
      phone: '+12025550102',
      name: '+12025550102',
    }),
  );
});
test('saving a phone contact returns to picker and allows optional name/security details', async () => {
  mockRegistered = true;
  await show(<FindPhoneScreen nativeHeader saveOnly initialNumber="+12025550102" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Find person' }));
  await screen.findByText('On Mnelo');
  await fireEvent.press(screen.getByRole('button', { name: 'Contact details & security' }));
  expect(screen.getByText('mnelo1:' + 'b'.repeat(64))).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Save contact as'), 'Development Bob');
  await fireEvent.press(screen.getByRole('button', { name: 'Add a contact' }));
  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/new-message'));
  expect(mockEngine.trustPhoneContact).toHaveBeenCalledWith({
    key: 'b'.repeat(64),
    phone: '+12025550102',
    name: 'Development Bob',
  });
  expect(router.push).not.toHaveBeenCalled();
});

test('a new installation asks for the number without requiring a name or creating keys until Send', async () => {
  mockHasIdentity = false;
  await show(<PhoneScreen />);
  expect(await screen.findByLabelText('Mobile number')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Your name')).toBeNull();
  expect(mockEngine.createIdentity).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+12025550101');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('6-digit SMS code');
  expect(mockEngine.createIdentity).toHaveBeenCalledTimes(1);
  expect(mockEngine.completePhoneEnrollment).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
test('number changes preserve the current enrollment on invalid OTP and return to Me only after verification', async () => {
  await show(<PhoneScreen changing initialDiscoverable={false} />);
  expect(await screen.findByText('Change phone number')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Mobile number'), '+12025550102');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.changeText(await screen.findByLabelText('6-digit SMS code'), '000000');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify number' }));
  await screen.findByText('The code is incorrect. Try again.');
  expect(mockEngine.completePhoneEnrollment).not.toHaveBeenCalled();
  expect(mockEngine.rememberPhone).not.toHaveBeenCalled();
  expect(mockEngine.createIdentity).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('6-digit SMS code'), '864209');
  await fireEvent.press(screen.getByRole('button', { name: 'Verify number' }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/me'));
  expect(mockClient.execute).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'verify', discoverable: false }),
  );
});

test('entry shows the approved brand and inline phone field without a discovery choice or explanatory wall', async () => {
  mockHasIdentity = false;
  await show(<PhoneScreen />);
  expect(await screen.findByLabelText('Mnelo')).toBeOnTheScreen();
  expect(screen.getByPlaceholderText('Mobile number')).toBeOnTheScreen();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText('What’s your number?')).toBeNull();
  expect(screen.queryByText(/Verify your mobile number to start/)).toBeNull();
  expect(screen.queryByText(/Registration stores a minimal/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Restore a backup' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Privacy' }));
  expect(await screen.findByText(/Your phone number is the main way/)).toBeOnTheScreen();
  expect(screen.getByText(/Registration stores a minimal/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText(/Your phone number is the main way/)).toBeNull();
  expect(screen.getByPlaceholderText('Mobile number')).toBeOnTheScreen();
  expect(mockEngine.createIdentity).not.toHaveBeenCalled();
  expect(mockClient.execute).not.toHaveBeenCalled();
});

test('a registered person can disable number discovery in Me privacy without unlinking or losing enrollment', async () => {
  mockRegistered = true;
  await show(<PhonePrivacySection />);
  const toggle = await screen.findByRole('checkbox', {
    name: 'Let people find me by my number',
    checked: true,
  });
  await fireEvent.press(toggle);
  await screen.findByRole('checkbox', { name: 'Let people find me by my number', checked: false });
  expect(mockClient.execute).toHaveBeenCalledWith({ action: 'visibility', discoverable: false });
  expect(mockClient.execute).not.toHaveBeenCalledWith(
    expect.objectContaining({ action: 'unlink' }),
  );
  expect(mockEngine.rememberPhone).not.toHaveBeenCalled();
  expect(mockEngine.completePhoneEnrollment).not.toHaveBeenCalled();
});

test('isolated preview review entry uses a private access key without claiming an SMS was sent', async () => {
  const previous = process.env.EXPO_PUBLIC_APP_ENV;
  process.env.EXPO_PUBLIC_APP_ENV = 'preview';
  mockService = 'https://identity-dev.mnelo.com';
  mockReview = true;
  try {
    await show(<PhoneScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Mobile number'), '+12025550198');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    const key = await screen.findByLabelText('Review access key');
    expect(key).toHaveProp('secureTextEntry', true);
    expect(screen.getByText(/No SMS is sent/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('6-digit SMS code')).not.toBeOnTheScreen();
    await fireEvent.changeText(key, '123456');
    expect(screen.getByRole('button', { name: 'Open review account' })).toBeDisabled();
    await fireEvent.changeText(key, '2'.repeat(32));
    await fireEvent.press(screen.getByRole('button', { name: 'Open review account' }));
    await waitFor(() =>
      expect(mockEngine.completePhoneEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+12025550198', testOnly: true, service: mockService }),
        'a'.repeat(64),
      ),
    );
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/chats');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = previous;
  }
});

test('a review flag cannot enable a normal phone number in preview', async () => {
  const previous = process.env.EXPO_PUBLIC_APP_ENV;
  process.env.EXPO_PUBLIC_APP_ENV = 'preview';
  mockService = 'https://identity-dev.mnelo.com';
  mockReview = true;
  try {
    await show(<PhoneScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Mobile number'), '+12025550101');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Phone service could not complete this action. Please try again.');
    expect(screen.queryByLabelText('Review access key')).not.toBeOnTheScreen();
    expect(mockEngine.completePhoneEnrollment).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = previous;
  }
});
