import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ContactPickerScreen } from '@/messenger/screens/ContactPickerScreen';
import { NumberKeypad } from '@/messenger/screens/NumberKeypad';
import { AppText } from '@/components/AppText';
import { composerNavigation } from '@/messenger/screens/composer-navigation';
import type { Contact } from '@/messenger/model';
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
const alice = { key: 'a'.repeat(64), name: 'Development Alice', blocked: false };
const bob = { key: 'b'.repeat(64), name: 'Development Bob', blocked: false };
const mockEngine = {
  currentIdentity: () => ({ key: 'd'.repeat(64), secret: 'test-only' }),
  contacts: jest.fn(async (): Promise<Contact[]> => [
    bob,
    alice,
    { key: 'c'.repeat(64), name: 'Blocked', blocked: true },
  ]),
  trustContact: jest.fn(async () => 'direct-id'),
  trustPhoneContact: jest.fn(async () => 'direct-id'),
};
const mockMesh = { focus: jest.fn(), online: jest.fn(() => false) };
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({
    engine: mockEngine,
    view: mockEngine,
    calls: null,
    mesh: mockMesh,
    identity: { key: 'd'.repeat(64) },
  }),
}));
const mockPhoneClient = {
  execute: jest.fn(async (command: { action: string }) =>
    command.action === 'status' ? { registered: true } : { key: 'e'.repeat(64) },
  ),
};
jest.mock('@/messenger/phone-client', () => ({ devicePhoneClient: () => mockPhoneClient }));
async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ContactPickerScreen mode="chat" />
    </QueryClientProvider>,
  );
}
test('new chat opens a compact picker and selecting a saved person dismisses it before opening chat', async () => {
  await show();
  const person = await screen.findByRole('button', { name: 'Development Alice' });
  expect(screen.getByRole('button', { name: 'New group' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'New contact' })).toBeOnTheScreen();
  expect(screen.queryByLabelText('Their Mnelo code')).toBeNull();
  expect(screen.queryByText('Blocked')).toBeNull();
  await fireEvent.press(person);
  await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/chats'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'direct-id' } });
  expect(mockMesh.focus).not.toHaveBeenCalled();
});
test('search filters locally and hides unrelated actions without probing contacts', async () => {
  await show();
  await screen.findByRole('button', { name: 'Development Alice' });
  await fireEvent.changeText(screen.getByLabelText('Search name or number'), 'BOB');
  expect(screen.getByRole('button', { name: 'Development Bob' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Development Alice' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'New group' })).toBeNull();
  expect(mockMesh.focus).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
  expect(screen.getByRole('button', { name: 'Development Alice' })).toBeOnTheScreen();
});
test.each(['+995 555 12 34 56', '555123456'])(
  'complete number %s resolves inside the picker with an inline country selector',
  async (number) => {
    await show();
    await fireEvent.changeText(screen.getByLabelText('Search name or number'), number);
    expect(screen.getByRole('button', { name: 'Country. Georgia +995' })).toBeOnTheScreen();
    expect(await screen.findByText('On Mnelo')).toBeOnTheScreen();
    expect(mockPhoneClient.execute).toHaveBeenCalledWith({
      action: 'lookup',
      phone: '+995555123456',
    });
    expect(mockEngine.trustPhoneContact).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Message' }));
    await waitFor(() =>
      expect(mockEngine.trustPhoneContact).toHaveBeenCalledWith({
        key: 'e'.repeat(64),
        phone: '+995555123456',
        name: '+995555123456',
      }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/chat/[id]',
      params: { id: 'direct-id' },
    });
    expect(
      mockPhoneClient.execute.mock.calls.every(
        ([c]) => c.action === 'lookup' || c.action === 'status',
      ),
    ).toBe(true);
  },
);
test('a contact blocked after the picker loads cannot create a chat', async () => {
  await show();
  const contact = await screen.findByRole('button', { name: 'Development Alice' });
  mockEngine.contacts.mockResolvedValueOnce([{ ...alice, blocked: true }]);
  await fireEvent.press(contact);
  await screen.findByRole('alert');
  expect(mockEngine.trustContact).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
test('call composer close and completion return through the originating Calls tab', () => {
  const navigation = composerNavigation('calls');
  navigation.close();
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/calls');
  navigation.returnToPicker();
  expect(router.dismissTo).toHaveBeenCalledWith('/new-call');
  navigation.finish({ pathname: '/call/[id]', params: { id: 'chat' } });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/call/[id]', params: { id: 'chat' } });
});
function KeypadHarness() {
  const [value, setValue] = useState('');
  return (
    <>
      <AppText accessibilityLabel="Dialed number">{value}</AppText>
      <NumberKeypad value={value} onChange={setValue} disabled={false} />
    </>
  );
}
test('opening contacts from Me closes back to Me and still returns to the chat picker after saving', () => {
  const navigation = composerNavigation('me');
  navigation.close();
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/me');
  navigation.returnToPicker();
  expect(router.dismissTo).toHaveBeenCalledWith('/new-message');
});
test('keypad enters and deletes digits and supports country-code prefix without duplication', async () => {
  await render(<KeypadHarness />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add country code prefix' }));
  await fireEvent.press(screen.getByRole('button', { name: '9' }));
  await fireEvent.press(screen.getByRole('button', { name: '9' }));
  await fireEvent.press(screen.getByRole('button', { name: '5' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add country code prefix' }));
  expect(screen.getByLabelText('Dialed number')).toHaveTextContent('+995');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete digit' }));
  expect(screen.getByLabelText('Dialed number')).toHaveTextContent('+99');
  await fireEvent(screen.getByRole('button', { name: 'Delete digit' }), 'longPress');
  expect(screen.getByLabelText('Dialed number').props.children).toBe('');
});
