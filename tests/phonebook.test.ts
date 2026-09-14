import {
  managePhonebookAccess,
  savedPhoneName,
  savedPhoneNames,
  ensurePhonebookAccess,
  addPhoneContact,
  searchPhonebook,
} from '@/messenger/phonebook.native';
import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Linking } from 'react-native';
import { observePhonebook } from '@/messenger/phonebook-events';
import { rememberPhonebookName, type PhonebookMatch } from '@/messenger/phonebook-match';
jest.mock('expo-contacts', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(),
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  Contact: { getAllDetails: jest.fn(), presentAccessPicker: jest.fn(), create: jest.fn() },
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

test('duplicate phone contacts keep the first nonempty name in device order and every distinct alias', async () => {
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true } as never);
  const rows = [
    { fullName: ' ', phones: [{ number: '+12025550101' }] },
    { fullName: 'ჩემი მეგობარი ❣️', phones: [{ number: '(202) 555-0101' }] },
    { fullName: 'Friend <3', phones: [{ number: '+12025550101' }] },
    { fullName: ' Friend <3 ', phones: [{ number: '+12025550101' }] },
  ];
  jest.mocked(Contact.getAllDetails).mockResolvedValueOnce(rows as never);
  expect(await savedPhoneName('+12025550101', '+12025550102')).toBe('ჩემი მეგობარი ❣️');
  const matches = new Map<string, PhonebookMatch>();
  for (const row of rows) rememberPhonebookName(matches, '+12025550101', row.fullName);
  expect(matches.get('+12025550101')).toEqual({
    name: 'ჩემი მეგობარი ❣️',
    aliases: ['ჩემი მეგობარი ❣️', 'Friend <3'],
  });
  const reversed = new Map<string, PhonebookMatch>();
  for (const row of [...rows].reverse())
    rememberPhonebookName(reversed, '+12025550101', row.fullName);
  expect(reversed.get('+12025550101')?.name).toBe('Friend <3');
});

test('a blank duplicate on a full first page does not hide a named contact on the next page', async () => {
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest
    .mocked(Contact.getAllDetails)
    .mockResolvedValueOnce(
      Array.from({ length: 200 }, () => ({
        fullName: '',
        phones: [{ number: '+12025550101' }],
      })) as never,
    )
    .mockResolvedValueOnce([
      { fullName: 'Later named contact', phones: [{ number: '+12025550101' }] },
    ] as never);
  expect(await savedPhoneName('+12025550101')).toBe('Later named contact');
  expect(Contact.getAllDetails).toHaveBeenLastCalledWith(['fullName', 'phones'], {
    limit: 200,
    offset: 200,
  });
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

test('first use requests system access once even when two contact surfaces mount together', async () => {
  let permission = { status: 'undetermined', granted: false, canAskAgain: true };
  jest.mocked(getPermissionsAsync).mockImplementation(async () => permission as never);
  jest.mocked(requestPermissionsAsync).mockImplementationOnce(async () => {
    permission = { status: 'granted', granted: true, canAskAgain: true };
    return permission as never;
  });
  await Promise.all([ensurePhonebookAccess(), ensurePhonebookAccess()]);
  await ensurePhonebookAccess();
  expect(requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test.each([
  { status: 'denied', granted: false, canAskAgain: false },
  { status: 'granted', granted: true, accessPrivileges: 'limited' },
  { status: 'granted', granted: true, accessPrivileges: 'all' },
])('default access respects the existing system decision: %j', async (permission) => {
  jest.mocked(getPermissionsAsync).mockResolvedValue(permission as never);
  await ensurePhonebookAccess();
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Contact.presentAccessPicker).not.toHaveBeenCalled();
});

test('an explicit save writes the complete phone and name once, and concurrent taps share the save', async () => {
  jest.mocked(getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as never);
  jest.mocked(Contact.getAllDetails).mockResolvedValue([]);
  jest.mocked(Contact.create).mockResolvedValue({ id: 'created' } as never);
  const changed = jest.fn();
  const remove = observePhonebook(changed);
  expect(
    await Promise.all([
      addPhoneContact('+995555010101', 'ჩემი მეგობარი'),
      addPhoneContact('+995555010101', 'ჩემი მეგობარი'),
    ]),
  ).toEqual([true, true]);
  expect(Contact.create).toHaveBeenCalledTimes(1);
  expect(Contact.create).toHaveBeenCalledWith({
    givenName: 'ჩემი მეგობარი',
    phones: [{ label: 'mobile', number: '+995555010101' }],
  });
  expect(changed).toHaveBeenCalledTimes(1);
  remove();
});

test('an existing contact without a name still prevents a duplicate phone entry', async () => {
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest
    .mocked(Contact.getAllDetails)
    .mockResolvedValue([{ fullName: '', phones: [{ number: '555 01 01 01' }] }] as never);
  expect(await addPhoneContact('+995555010101', 'Mnelo name')).toBe(true);
  expect(Contact.create).not.toHaveBeenCalled();
});

test('denied access and a native save failure never report a successful phone save', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false } as never);
  await expect(addPhoneContact('+995555010101', 'Name')).rejects.toThrow(
    'PHONE_CONTACTS_PERMISSION',
  );
  expect(Contact.create).not.toHaveBeenCalled();
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest.mocked(Contact.getAllDetails).mockResolvedValue([]);
  jest.mocked(Contact.create).mockRejectedValueOnce(new Error('Device save failed'));
  await expect(addPhoneContact('+995555010101', 'Name')).rejects.toThrow('Device save failed');
});

test('call search matches local names and complete normalized phones without requesting extra access', async () => {
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValue({ granted: false, accessPrivileges: 'limited' } as never);
  jest.mocked(Contact.getAllDetails).mockResolvedValue([
    { fullName: 'მეგობარი', phones: [{ number: '555 01 01 01' }, { number: '+995555010101' }] },
    { fullName: 'My own number', phones: [{ number: '+995555010104' }] },
    { fullName: 'Someone else', phones: [{ number: '+12025550101' }] },
  ] as never);
  expect(await searchPhonebook('მეგო', '+995555010104')).toEqual([
    { name: 'მეგობარი', phone: '+995555010101' },
  ]);
  expect(await searchPhonebook('+995 555 01 01 01', '+995555010104')).toEqual([
    { name: 'მეგობარი', phone: '+995555010101' },
  ]);
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Contact.presentAccessPicker).not.toHaveBeenCalled();
});
test('call search stops on permission revocation or cancellation and caps matches', async () => {
  jest.mocked(getPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest.mocked(Contact.getAllDetails).mockResolvedValue(
    Array.from({ length: 20 }, (_, i) => ({
      fullName: 'Friend ' + i,
      phones: [{ number: '+1202555' + String(1000 + i) }],
    })) as never,
  );
  expect(await searchPhonebook('Friend')).toHaveLength(8);
  jest
    .mocked(getPermissionsAsync)
    .mockResolvedValueOnce({ granted: true } as never)
    .mockResolvedValueOnce({ granted: false } as never);
  expect(await searchPhonebook('Friend')).toEqual([]);
  const controller = new AbortController();
  controller.abort();
  jest.mocked(Contact.getAllDetails).mockClear();
  expect(await searchPhonebook('Friend', undefined, controller.signal)).toEqual([]);
  expect(Contact.getAllDetails).not.toHaveBeenCalled();
});
