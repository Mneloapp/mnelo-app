import { act, renderHook } from '@testing-library/react-native';
import { useQuotedMessageScroll } from '@/messenger/useQuotedMessageScroll';
import type { FlatList } from 'react-native';
import type { LocalMessage } from '@/messenger/model';
const row = (id: string, sequence: number) => ({ id, sequence, chatId: 'chat' }) as LocalMessage;
test('quoted message loads earlier pages, retries unmeasured rows and highlights only when visible', async () => {
  jest.useFakeTimers();
  const scrollToIndex = jest.fn(),
    scrollToOffset = jest.fn();
  const list = { current: { scrollToIndex, scrollToOffset } as unknown as FlatList<LocalMessage> };
  const newest = row('new', 120),
    middle = row('middle', 80),
    original = row('original', 40);
  const more = jest
    .fn()
    .mockResolvedValueOnce({ data: { pages: [[newest], [middle]] }, hasNextPage: true })
    .mockResolvedValueOnce({
      data: { pages: [[newest], [middle], [original]] },
      hasNextPage: true,
    });
  const exists = jest.fn(async () => true);
  const hook = await renderHook(
    ({ rows }: { rows: LocalMessage[] }) =>
      useQuotedMessageScroll('chat', list, rows, exists, more, false),
    { initialProps: { rows: [newest] } },
  );
  await act(() => hook.result.current.jump('original'));
  expect(more).toHaveBeenCalledTimes(2);
  expect(scrollToIndex).not.toHaveBeenCalled();
  await hook.rerender({ rows: [newest, middle, original] });
  await act(() => jest.runOnlyPendingTimers());
  expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 2, viewPosition: 0.5, animated: true });
  await act(() => hook.result.current.onScrollToIndexFailed({ index: 2, averageItemLength: 60 }));
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 120, animated: false });
  await act(() => jest.advanceTimersByTime(150));
  expect(scrollToIndex).toHaveBeenCalledTimes(2);
  await act(() =>
    hook.result.current.onViewableItemsChanged({
      viewableItems: [{ key: 'original', item: original, index: 2, isViewable: true }],
    }),
  );
  expect(hook.result.current.highlighted).toBe('original');
  await act(() => jest.advanceTimersByTime(1600));
  expect(hook.result.current.highlighted).toBeNull();
  await hook.unmount();
  jest.useRealTimers();
});
test('missing or cross-chat quote never scrolls or loads unrelated history', async () => {
  const list = { current: null },
    more = jest.fn();
  const hook = await renderHook(() =>
    useQuotedMessageScroll('chat', list, [], async () => false, more, true),
  );
  await act(() => hook.result.current.jump('other-chat-id'));
  expect(hook.result.current.unavailable).toBe(true);
  expect(more).not.toHaveBeenCalled();
});

test('a quote to a photo inside an album scrolls to and highlights that album without loading extra pages', async () => {
  jest.useFakeTimers();
  const scrollToIndex = jest.fn(),
    more = jest.fn();
  const list = { current: { scrollToIndex } as unknown as FlatList<LocalMessage> };
  const album = { ...row('first', 10), photos: [row('first', 10), row('second', 11)] };
  const hook = await renderHook(() =>
    useQuotedMessageScroll('chat', list, [album], async () => true, more, false),
  );
  await act(() => hook.result.current.jump('second'));
  await act(() => jest.runOnlyPendingTimers());
  expect(scrollToIndex).toHaveBeenCalledWith({ index: 0, viewPosition: 0.5, animated: true });
  expect(more).not.toHaveBeenCalled();
  await act(() =>
    hook.result.current.onViewableItemsChanged({
      viewableItems: [{ key: 'first', item: album, index: 0, isViewable: true }],
    }),
  );
  expect(hook.result.current.highlighted).toBe('second');
  await hook.unmount();
  jest.useRealTimers();
});
