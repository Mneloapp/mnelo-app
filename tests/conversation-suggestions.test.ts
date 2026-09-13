import { observeConversationSuggestions } from '@/messenger/conversation-suggestions';
import type { ConversationActivity, DeviceMessenger } from '@/messenger/engine';
import type { ContactView } from '@/messenger/contact-view';
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
test('only committed activity donates metadata; blocked chats do not donate and clears follow pending donations', async () => {
  let event: (value: ConversationActivity) => void = () => undefined;
  let blocked = false;
  const unsubscribe = jest.fn();
  const engine = {
    subscribeConversationActivity: (listener: typeof event) => {
      event = listener;
      return unsubscribe;
    },
    currentIdentity: () => ({ key: 'own' }),
    contactProfile: async () => null,
  } as unknown as DeviceMessenger;
  const view = {
    chat: async () => ({ id: 'opaque-chat', kind: 'direct', title: 'Test contact', peer: 'peer' }),
    members: async () => [{ key: 'own' }, { key: 'peer' }],
    contacts: async () => [{ key: 'peer', blocked }],
  } as unknown as ContactView;
  const native = {
    donateConversation: jest.fn(async () => true),
    forgetConversation: jest.fn(async () => true),
  };
  const close = observeConversationSuggestions(engine, view, native);
  await tick();
  expect(native.donateConversation).not.toHaveBeenCalled();
  event({ type: 'message', chat: 'opaque-chat', outgoing: true });
  await tick();
  expect(native.donateConversation).toHaveBeenCalledWith('opaque-chat', 'Test contact', null, true);
  blocked = true;
  event({ type: 'message', chat: 'opaque-chat', outgoing: false });
  await tick();
  expect(native.donateConversation).toHaveBeenCalledTimes(1);
  event({ type: 'forget', chat: 'opaque-chat' });
  close(); // Account/profile updates may unmount the observer immediately.
  await tick();
  expect(native.forgetConversation).toHaveBeenCalledWith('opaque-chat');
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
