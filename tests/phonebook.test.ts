import { savedPhoneName, savedPhoneNames } from '@/messenger/phonebook.native';
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

test('limited permission resolves multiple existing phones in one pass and discards unrelated names', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValue({ granted: false, accessPrivileges: 'limited' } as Awaited<
      ReturnType<typeof getPermissionsAsync>
    >);
  jest.mocked(Contact.getAllDetails).mockResolvedValueOnce([
    { fullName: 'Friend A', phones: [{ number: '2025550101' }] },
    { fullName: 'Friend B', phones: [{ number: '+12025550102' }] },
    { fullName: 'Unrelated', phones: [{ number: '+12025550103' }] },
  ] as never);
  expect([...(await savedPhoneNames(['+12025550101', '+12025550102'], '+12025550104'))]).toEqual([
    ['+12025550101', 'Friend A'],
    ['+12025550102', 'Friend B'],
  ]);
  expect(Contact.getAllDetails).toHaveBeenCalledTimes(1);
});
test('permission revoked during a contact read discards already read names', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValueOnce({ granted: true } as never)
    .mockResolvedValueOnce({ granted: false } as never);
  jest
    .mocked(Contact.getAllDetails)
    .mockResolvedValueOnce([
      { fullName: 'Private local name', phones: [{ number: '+12025550101' }] },
    ] as never);
  expect((await savedPhoneNames(['+12025550101'])).size).toBe(0);
});
