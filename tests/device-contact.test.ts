import { Contact, getPermissionsAsync } from 'expo-contacts';
import { chooseDeviceContactName } from '@/features/chats/device-contact';

jest.mock('expo-contacts', () => ({
  Contact: { presentPicker: jest.fn() },
  getPermissionsAsync: jest.fn(),
}));
const pick = jest.mocked(Contact.presentPicker);
const permission = jest.mocked(getPermissionsAsync);
beforeEach(() => jest.resetAllMocks());
test('cancel does not read or request contact permissions', async () => {
  pick.mockResolvedValue(null);
  expect(await chooseDeviceContactName()).toBeNull();
  expect(permission).not.toHaveBeenCalled();
});
test('only the selected contact name is read', async () => {
  pick.mockResolvedValue({
    getGivenName: async () => 'Development',
    getFamilyName: async () => 'Contact',
  } as Awaited<ReturnType<typeof Contact.presentPicker>>);
  expect(await chooseDeviceContactName()).toBe('Development Contact');
  expect(permission).not.toHaveBeenCalled();
});
test('OS denial produces an actionable permission error', async () => {
  pick.mockRejectedValue(new Error('Native contact access denied'));
  permission.mockResolvedValue({ status: 'denied' } as Awaited<
    ReturnType<typeof getPermissionsAsync>
  >);
  await expect(chooseDeviceContactName()).rejects.toMatchObject({
    code: 'CONTACTS_PERMISSION_REQUIRED',
  });
});
test('unrelated native failures are not falsely labelled permission denials', async () => {
  const error = new Error('Native picker unavailable');
  pick.mockRejectedValue(error);
  permission.mockResolvedValue({ status: 'granted' } as Awaited<
    ReturnType<typeof getPermissionsAsync>
  >);
  await expect(chooseDeviceContactName()).rejects.toBe(error);
});
