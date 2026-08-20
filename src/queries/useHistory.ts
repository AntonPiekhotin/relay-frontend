/**
 * Conversation history — `useInfiniteQuery` over the `before` cursor, newest page first.
 *
 * Cursors are message ids you already hold, never offsets: new messages insert at the head and an
 * offset silently skips rows (docs/MESSAGING.md §4). A cursor from another dialog is a 400, which
 * is why the dialog id is part of the query key and never shared.
 */

import { useInfiniteQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { getHistory } from '@/lib/api/messages'
import type { MessageHistoryResponse } from '@/lib/api/types'
import { fromHistoryRow, mergeMessages } from '@/lib/chat/message'
import type { ChatMessage } from '@/lib/chat/message'
import { qk } from './keys'

export const HISTORY_PAGE_SIZE = 50

export type HistoryQueryData = InfiniteData<MessageHistoryResponse, string | null>

export function historyToMessages(data: HistoryQueryData | undefined): ChatMessage[] {
  if (!data) return []
  return mergeMessages(
    [],
    data.pages.flatMap((page) => page.messages.map(fromHistoryRow)),
  )
}

export function useHistory(dialogId: string | undefined) {
  return useInfiniteQuery<MessageHistoryResponse, Error, ChatMessage[], readonly string[], string | null>({
    queryKey: qk.history(dialogId ?? ''),
    enabled: Boolean(dialogId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => getHistory(dialogId as string, pageParam, HISTORY_PAGE_SIZE),
    // A short page, or a null cursor, is the end. Either one alone is enough.
    getNextPageParam: (lastPage) =>
      lastPage.messages.length < HISTORY_PAGE_SIZE ? null : lastPage.nextCursor,
    select: historyToMessages,
    staleTime: 30_000,
  })
}
