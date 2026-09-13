import { savedPhoneName } from '@/messenger/phonebook.native';
import { Contact, getPermissionsAsync } from 'expo-contacts';
jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(),
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  Contact: { getAllDetails: jest.fn() },
}));
test('no contact read without permission, and local formatting matches the complete phone only', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValueOnce({ granted: false } as Awaited<ReturnType<typeof getPermissionsAsync>>);
  expect(await savedPhoneName('+12025550101')).toBeNull();
  expect(Contact.getAllDetails).not.toHaveBeenCalled();
  jest.mocked(Contact.getAllDetails).mockResolvedValueOnce([
    { fullName: 'Wrong country', phones: [{ number: '+442025550101' }] },
    { fullName: 'My saved friend', phones: [{ number: '(202) 555-0101' }] },
  ] as never);
  expect(await savedPhoneName('+12025550101', '+12025550102')).toBe('My saved friend');
  expect(Contact.getAllDetails).toHaveBeenCalledWith(['fullName', 'phones'], {
    limit: 200,
    offset: 0,
  });
});
