import '@/i18n';

// Screen tests have no native address book. Permission-specific behavior is
// exercised separately against the native adapter in phonebook.test.ts.
jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
    granted: false,
    canAskAgain: false,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
    granted: false,
    canAskAgain: false,
  })),
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  Contact: {
    getAllDetails: jest.fn(async () => []),
    presentAccessPicker: jest.fn(async () => []),
    create: jest.fn(async () => ({ id: 'new-contact' })),
  },
  addContactsChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
