import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { ChatHistoryRow } from '@/messenger/components/ChatHistoryRow';
import { PinnedChats } from '@/messenger/components/PinnedChats';
import { createChatPins, separatePinnedChats } from '@/messenger/chat-pins-core';
import type { Chat } from '@/messenger/model';

const chat = (id: string): Chat => ({
  id,
  kind: 'direct',
  title: 'Saved contact',
  owner: 'owner',
  revision: 1,
  left_group: 0,
  unread: 2,
  preview: 'A message',
  previewKind: 'text',
  activity: 1,
  updated: 1,
});
function memory() {
  const data = new Map<string, string>();
  const storage = {
    read: jest.fn(async (owner: string) => data.get(owner) ?? null),
    write: jest.fn(async (owner: string, value: string) => {
      data.set(owner, value);
    }),
  };
  return { data, storage };
}

test('pins survive a new store instance, preserve order and remain separate by account', async () => {
  const { storage } = memory();
  const first = createChatPins(storage);
  await first.toggle('alice', 'direct-a');
  await first.toggle('alice', 'group-b');
  await first.toggle('bob', 'direct-b');
  const reopened = createChatPins(storage);
  await Promise.all([reopened.restore('alice'), reopened.restore('bob')]);
  expect(reopened.snapshot('alice').ids).toEqual(['direct-a', 'group-b']);
  expect(reopened.snapshot('bob').ids).toEqual(['direct-b']);
  expect(reopened.snapshot(undefined).ids).toEqual([]);
});

test('rapid changes serialize without overwriting pins and unpin is persisted', async () => {
  const { storage } = memory();
  const pins = createChatPins(storage);
  await Promise.all([
    pins.toggle('alice', 'a'),
    pins.toggle('alice', 'b'),
    pins.toggle('alice', 'a'),
  ]);
  expect(pins.snapshot('alice').ids).toEqual(['b']);
  const reopened = createChatPins(storage);
  await reopened.restore('alice');
  expect(reopened.snapshot('alice').ids).toEqual(['b']);
});

test('deleted IDs are removed, pins beyond the current page remain and rows never duplicate pins', async () => {
  const { storage } = memory();
  const pins = createChatPins(storage);
  await pins.toggle('alice', 'older-page');
  await pins.toggle('alice', 'deleted-chat');
  await pins.remove('alice', ['deleted-chat']);
  const reopened = createChatPins(storage);
  await reopened.restore('alice');
  expect(reopened.snapshot('alice').ids).toEqual(['older-page']);
  expect(separatePinnedChats([chat('recent'), chat('older-page')], [chat('older-page')])).toEqual([
    chat('recent'),
  ]);
  expect(separatePinnedChats([chat('recent')], [chat('older-page')])).toEqual([chat('recent')]);
});

test('a failed write leaves both persisted and rendered preferences intact', async () => {
  const { storage } = memory();
  const pins = createChatPins(storage);
  await pins.toggle('alice', 'a');
  storage.write.mockRejectedValueOnce(new Error('KEYCHAIN_LOCKED'));
  await expect(pins.toggle('alice', 'b')).rejects.toThrow('KEYCHAIN_LOCKED');
  expect(pins.snapshot('alice').ids).toEqual(['a']);
  await pins.toggle('alice', 'c');
  expect(pins.snapshot('alice').ids).toEqual(['a', 'c']);
});

test('failed reads never overwrite saved IDs with an empty preference', async () => {
  const { storage } = memory();
  storage.read.mockRejectedValueOnce(new Error('KEYCHAIN_LOCKED'));
  const pins = createChatPins(storage);
  await expect(pins.toggle('alice', 'new-chat')).rejects.toThrow('CHAT_PINS_UNAVAILABLE');
  expect(storage.write).not.toHaveBeenCalled();
  await pins.toggle('alice', 'new-chat');
  expect(pins.snapshot('alice').ids).toEqual(['new-chat']);
});

test('pin management is available through long press and accessibility actions without intercepting open chat', async () => {
  const open = jest.fn();
  const manage = jest.fn();
  await render(
    <ChatHistoryRow
      chat={chat('a')}
      subtitle="A message"
      avatar={<View />}
      onPress={open}
      onPin={manage}
    />,
  );
  const row = screen.getByRole('button', { name: /Saved contact/ });
  await fireEvent.press(row);
  expect(open).toHaveBeenCalledTimes(1);
  expect(manage).not.toHaveBeenCalled();
  await fireEvent(row, 'longPress');
  await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } });
  expect(manage).toHaveBeenCalledTimes(2);
  await render(
    <PinnedChats
      chats={[chat('a')]}
      subtitle={() => 'A message'}
      avatar={() => <View />}
      onPress={open}
      onManage={manage}
    />,
  );
  const tile = screen.getAllByRole('button', { name: /Saved contact/ }).at(-1)!;
  await fireEvent(tile, 'accessibilityAction', { nativeEvent: { actionName: 'unpin' } });
  expect(manage).toHaveBeenLastCalledWith(chat('a'));
});
