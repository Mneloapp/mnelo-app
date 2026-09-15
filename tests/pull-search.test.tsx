import { act, renderHook, render, screen } from '@testing-library/react-native';
import { usePullSearch, PullSearch } from '@/components/PullSearch';
import { chatStamp, ChatHistoryRow } from '@/messenger/components/ChatHistoryRow';
import type { Chat } from '@/messenger/model';
import { FlatList, View, type LayoutChangeEvent } from 'react-native';
const layout = (height: number) =>
  ({ nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } } }) as LayoutChangeEvent;
test('even an empty list has native scroll travel for its search header; later layout changes never reset a user scroll', async () => {
  const { result, rerender } = await renderHook(
    ({ value }: { value: string }) => usePullSearch<Chat>(value),
    { initialProps: { value: '' } },
  );
  const scrollToOffset = jest.fn();
  result.current.listRef.current = { scrollToOffset } as unknown as FlatList<Chat>;
  await act(() => result.current.scrollProps.onLayout(layout(600)));
  await act(() => result.current.measureHeader(layout(92)));
  expect(result.current.scrollProps.contentContainerStyle.minHeight).toBe(692);
  expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 92, animated: false });
  await act(() => result.current.scrollProps.onScrollBeginDrag());
  scrollToOffset.mockClear();
  await act(() => result.current.scrollProps.onLayout(layout(610)));
  expect(scrollToOffset).not.toHaveBeenCalled();
  await act(() => result.current.reveal());
  expect(scrollToOffset).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));
  await act(() => result.current.focus(true));
  expect(result.current.scrollProps.stickyHeaderIndices).toEqual([0]);
  expect(result.current.scrollProps.stickyHeaderHiddenOnScroll).toBe(false);
  await rerender({ value: 'Contact' });
  await act(() => result.current.focus(false));
  expect(result.current.locked).toBe(true);
  await rerender({ value: '' });
  await act(() => result.current.close());
  expect(result.current.scrollProps.stickyHeaderIndices).toEqual([0]);
  expect(result.current.scrollProps.stickyHeaderHiddenOnScroll).toBe(true);
  expect(scrollToOffset).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 92 }));
});
test('search is a persistent header with no animated height or border separating it from the list', async () => {
  await render(
    <PullSearch
      label="Find a chat"
      value=""
      onChangeText={jest.fn()}
      onFocusChange={jest.fn()}
      onClose={jest.fn()}
    />,
  );
  expect(screen.getByLabelText('Find a chat')).toBeVisible();
  expect(screen.getByTestId('pull-search-header')).not.toHaveStyle({ borderBottomWidth: 1 });
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
