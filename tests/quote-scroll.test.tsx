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

test('missing quote notice clears on the next interaction and ignores its late lookup', async () => {
  let finish!: (exists: boolean) => void;
  const more = jest.fn();
  const exists = jest
    .fn<Promise<boolean>, [string]>()
    .mockResolvedValueOnce(false)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const hook = await renderHook(() =>
    useQuotedMessageScroll('chat', { current: null }, [], exists, more, true),
  );
  await act(() => hook.result.current.jump('removed-photo'));
  expect(hook.result.current.unavailable).toBe(true);
  await act(() => hook.result.current.cancel());
  expect(hook.result.current.unavailable).toBe(false);
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.jump('removed-photo');
  });
  await act(() => hook.result.current.cancel());
  await act(async () => {
    finish(true);
    await pending;
  });
  expect(more).not.toHaveBeenCalled();
  expect(hook.result.current.unavailable).toBe(false);
  await hook.unmount();
});

test('a missing quote notice expires and cannot persist into another conversation', async () => {
  jest.useFakeTimers();
  const hook = await renderHook(
    ({ chat }: { chat: string }) =>
      useQuotedMessageScroll(chat, { current: null }, [], async () => false, jest.fn(), true),
    { initialProps: { chat: 'first' } },
  );
  await act(() => hook.result.current.jump('removed-photo'));
  await act(() => jest.advanceTimersByTime(5000));
  expect(hook.result.current.unavailable).toBe(false);
  await act(() => hook.result.current.jump('removed-photo'));
  expect(hook.result.current.unavailable).toBe(true);
  await hook.rerender({ chat: 'second' });
  expect(hook.result.current.unavailable).toBe(false);
  await hook.unmount();
  jest.useRealTimers();
});
