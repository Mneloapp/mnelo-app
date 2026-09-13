import {
  managePhonebookAccess,
  savedPhoneName,
  savedPhoneNames,
} from '@/messenger/phonebook.native';
import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Linking } from 'react-native';
import { observePhonebook } from '@/messenger/phonebook-events';
jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(),
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  Contact: { getAllDetails: jest.fn(), presentAccessPicker: jest.fn() },
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

test('Georgian local and international numbers match including copied direction marks, but a foreign number never matches by suffix', async () => {
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest.mocked(Contact.getAllDetails).mockResolvedValueOnce([
    { fullName: 'Wrong country', phones: [{ number: '+1555010101' }] },
    { fullName: 'ჩემი მეგობარი', phones: [{ number: '\u202a+995 555 01 01 01\u202c' }] },
    { fullName: 'მეორე მეგობარი', phones: [{ number: '555 01 01 02' }] },
    { fullName: 'მესამე მეგობარი', phones: [{ number: '00995 555 01 01 03' }] },
  ] as never);
  expect([
    ...(await savedPhoneNames(
      ['+995555010101', '+995555010102', '+995555010103'],
      '+995555010104',
    )),
  ]).toEqual([
    ['+995555010101', 'ჩემი მეგობარი'],
    ['+995555010102', 'მეორე მეგობარი'],
    ['+995555010103', 'მესამე მეგობარი'],
  ]);
});

test('limited access opens the contact selection sheet and not a permission request which cannot add the missing person', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValue({ granted: true, accessPrivileges: 'limited' } as never);
  jest.mocked(Contact.presentAccessPicker).mockResolvedValueOnce([]);
  const changed = jest.fn();
  const remove = observePhonebook(changed);
  await managePhonebookAccess();
  expect(Contact.presentAccessPicker).toHaveBeenCalledTimes(1);
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Contact.getAllDetails).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledTimes(1);
  remove();
});

test('denied access opens Settings instead of repeating an ineffective request', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValue({ granted: false, canAskAgain: false } as never);
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValueOnce();
  await managePhonebookAccess();
  expect(settings).toHaveBeenCalledTimes(1);
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  settings.mockRestore();
});
