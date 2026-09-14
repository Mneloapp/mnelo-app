import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList, ViewToken } from 'react-native';
import type { LocalMessage } from './model';

type Pages = { data?: { pages: LocalMessage[][] } | undefined; hasNextPage: boolean };
export function useQuotedMessageScroll(
  chat: string,
  list: RefObject<FlatList<LocalMessage> | null>,
  rows: LocalMessage[],
  exists: (id: string) => Promise<boolean>,
  more: () => Promise<Pages>,
  reduced: boolean,
) {
  const latest = useRef({ rows, exists, more });
  useLayoutEffect(() => {
    latest.current = { rows, exists, more };
  }, [rows, exists, more]);
  const request = useRef({ serial: 0 });
  const pending = useRef<string | null>(null);
  const attempts = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const generation = request.current;
    return () => {
      generation.serial++;
      pending.current = null;
      if (retry.current) clearTimeout(retry.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [chat]);
  function scroll() {
    const index = latest.current.rows.findIndex((row) => row.id === pending.current);
    if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: !reduced });
  }
  const index = rows.findIndex((row) => row.id === target);
  useEffect(() => {
    if (index < 0 || !target) return;
    pending.current = target;
    const frame = requestAnimationFrame(() =>
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: !reduced }),
    );
    return () => cancelAnimationFrame(frame);
  }, [index, target, list, reduced]);
  const visible = useCallback(({ viewableItems }: { viewableItems: ViewToken<LocalMessage>[] }) => {
    const id = pending.current;
    if (!id || !viewableItems.some((row) => row.isViewable && row.item.id === id)) return;
    pending.current = null;
    setTarget(null);
    setHighlighted(id);
    if (retry.current) clearTimeout(retry.current);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), 1600);
  }, []);
  return {
    highlighted,
    unavailable,
    cancel: () => {
      request.current.serial++;
      pending.current = null;
      setTarget(null);
      if (retry.current) clearTimeout(retry.current);
    },
    onViewableItemsChanged: visible,
    onScrollToIndexFailed: ({
      index,
      averageItemLength,
    }: {
      index: number;
      averageItemLength: number;
    }) => {
      if (!pending.current) return;
      if (++attempts.current > 12) {
        pending.current = null;
        setTarget(null);
        setUnavailable(true);
        return;
      }
      list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
      if (retry.current) clearTimeout(retry.current);
      retry.current = setTimeout(scroll, 120);
    },
    jump: async (id: string) => {
      const ticket = ++request.current.serial;
      attempts.current = 0;
      pending.current = null;
      setTarget(null);
      setUnavailable(false);
      try {
        if (!(await latest.current.exists(id))) {
          if (ticket === request.current.serial) setUnavailable(true);
          return;
        }
        let loaded = latest.current.rows;
        while (!loaded.some((row) => row.id === id)) {
          const before = loaded.at(-1)?.sequence;
          const page = await latest.current.more();
          if (ticket !== request.current.serial) return;
          loaded = page.data?.pages.flat() ?? [];
          if (loaded.some((row) => row.id === id)) break;
          if (!page.hasNextPage || loaded.at(-1)?.sequence === before) {
            setUnavailable(true);
            return;
          }
        }
        if (ticket === request.current.serial) setTarget(id);
      } catch {
        if (ticket === request.current.serial) setUnavailable(true);
      }
    },
  };
}
