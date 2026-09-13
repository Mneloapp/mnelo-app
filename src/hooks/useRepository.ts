import { createRefreshBatch } from '@/lib/refresh-batch';
import { useEffect, useState, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { repository } from '@/services';
import { encodeCursor } from '@/features/chats/cursor';
export function useConversations() {
  const q = useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam }) => repository().conversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 30 && last ? encodeCursor(last.updatedAt, last.id) : undefined;
    },
  });
  const seen = new Set<string>();
  return {
    ...q,
    data: q.data?.pages.flat().filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    }),
  };
}
export function useProfile(id: string) {
  return useQuery({
    queryKey: ['profile', id],
    queryFn: () => repository().profile(id),
    enabled: Boolean(id),
  });
}
export function useMessages(conversationId: string) {
  const cache = useQueryClient();
  const focused = useIsFocused();
  const [ready, setReady] = useState(repository().mode === 'preview');
  useEffect(() => {
    if (!focused) return;
    const batch = createRefreshBatch(() =>
      Promise.all([
        cache.invalidateQueries({ queryKey: ['messages', conversationId] }),
        cache.invalidateQueries({ queryKey: ['group', conversationId] }),
        cache.invalidateQueries({ queryKey: ['conversation', conversationId] }),
        cache.invalidateQueries({ queryKey: ['conversations'] }),
      ]),
    );
    const unsubscribe = repository().subscribe(conversationId, batch.request, setReady);
    return () => {
      batch.dispose();
      unsubscribe();
    };
  }, [conversationId, cache, focused]);
  const q = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) => repository().messages(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(conversationId),
  });
  const data = useMemo(() => {
    if (!q.data) return undefined;
    const seen = new Set<string>();
    return {
      items: q.data.pages
        .flatMap((p) => p.items)
        .filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        }),
    };
  }, [q.data]);
  return { ...q, ready, data };
}

export function useNeeds() {
  const q = useInfiniteQuery({
    queryKey: ['needs'],
    queryFn: ({ pageParam }) => repository().needs(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 30 && last ? encodeCursor(last.createdAt, last.id) : undefined;
    },
  });
  const seen = new Set<string>();
  return {
    ...q,
    data: q.data?.pages.flat().filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  };
}
