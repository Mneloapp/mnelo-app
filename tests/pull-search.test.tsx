import { act, renderHook, render, screen } from '@testing-library/react-native';
import { usePullSearch, searchScrollIntent, PullSearch } from '@/components/PullSearch';
import { chatStamp, ChatHistoryRow } from '@/messenger/components/ChatHistoryRow';
import type { Chat } from '@/messenger/model';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
const scroll = (y: number) =>
  ({ nativeEvent: { contentOffset: { x: 0, y } } }) as NativeSyntheticEvent<NativeScrollEvent>;
test('both lists reveal on intentional downward drag and collapse upward; bounce settling never reverses the state', async () => {
  const { result, rerender } = await renderHook(
    ({ query }: { query: string }) => usePullSearch(query),
    {
      initialProps: { query: '' },
    },
  );
  expect(result.current.visible).toBe(false);
  await act(() => {
    result.current.scrollProps.onScrollBeginDrag(scroll(0));
    result.current.scrollProps.onScroll(scroll(-40));
    result.current.scrollProps.onScrollEndDrag();
    result.current.scrollProps.onScroll(scroll(0));
  });
  expect(result.current.visible).toBe(true);
  await act(() => {
    result.current.scrollProps.onScrollBeginDrag(scroll(0));
    result.current.scrollProps.onScroll(scroll(50));
  });
  expect(result.current.visible).toBe(false);
  await act(() => result.current.focus(true));
  await act(() => result.current.scrollProps.onScroll(scroll(100)));
  expect(result.current.visible).toBe(true);
  await rerender({ query: 'Contact' });
  await act(() => result.current.focus(false));
  await act(() => result.current.scrollProps.onScroll(scroll(150)));
  expect(result.current.visible).toBe(true);
  await rerender({ query: '' });
  await act(() => result.current.scrollProps.onScroll(scroll(200)));
  expect(result.current.visible).toBe(false);
});
test('small direction changes do not repeatedly open and close search', () => {
  expect(searchScrollIntent(1, 3, 1).hide).toBe(false);
  expect(searchScrollIntent(0, -8, 0).reveal).toBe(false);
  expect(searchScrollIntent(300, 260, 0).reveal).toBe(true);
});
test('search remains mounted while hidden so toggling does not replace the input or reset query', async () => {
  const props = {
    label: 'Find a chat',
    value: '',
    onChangeText: jest.fn(),
    onFocusChange: jest.fn(),
    onClose: jest.fn(),
  };
  const { rerender } = await render(<PullSearch {...props} visible />);
  expect(screen.getByLabelText('Find a chat')).toBeVisible();
  await rerender(<PullSearch {...props} visible={false} />);
  expect(screen.getByLabelText('Find a chat', { includeHiddenElements: true })).toBeTruthy();
});
test('chat rows show the latest local activity at the upper right in 24-hour format and keep unread counts', async () => {
  const now = new Date(2026, 8, 13, 23, 43).getTime(),
    updated = new Date(2026, 8, 13, 0, 5).getTime();
  expect(chatStamp(updated, now)).toBe('00:05');
  expect(chatStamp(0, now)).toBe('');
  expect(chatStamp(new Date(2026, 8, 12, 12).getTime(), now)).not.toMatch(/AM|PM/);
  const chat: Chat = {
    id: 'c',
    kind: 'direct',
    title: 'Fixture contact',
    owner: 'me',
    revision: 1,
    left_group: 0,
    unread: 2,
    preview: 'Last message',
    previewKind: 'text',
    activity: 1,
    updated,
  };
  await render(
    <ChatHistoryRow
      chat={chat}
      subtitle={chat.preview}
      avatar={<View />}
      now={now}
      onPress={() => {}}
    />,
  );
  expect(screen.getByText('00:05')).toBeVisible();
  expect(screen.getByText('Last message')).toBeVisible();
});

test('a new message after midnight shows its time even before the list clock ticks', () => {
  const midnight = new Date(2026, 8, 14, 0, 0).getTime();
  expect(chatStamp(midnight, midnight)).toBe('00:00');
});
