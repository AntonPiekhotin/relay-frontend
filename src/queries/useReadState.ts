/**
 * The seen-by snapshot, and the read ticks derived from it.
 *
 * `GET /dialogs/{id}/read-state` is where you start; `message.read` frames are the deltas
 * (docs/MESSAGING.md §5). A member who has never read is ABSENT from `entries`, not present with
 * nulls — so a "seen by N" count simply does not count them.
 */

import { useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { getReadState } from '@/lib/api/dialogs'
import type { ReadStateEntry, ReadStateResponse } from '@/lib/api/types'
import type { ChatMessage } from '@/lib/chat/message'
import { toMillis } from '@/lib/time'
import { qk } from './keys'

export function useReadState(dialogId: string | undefined) {
  return useQuery<ReadStateResponse>({
    queryKey: qk.readState(dialogId ?? ''),
    queryFn: () => getReadState(dialogId as string),
    enabled: Boolean(dialogId),
    staleTime: 60_000,
  })
}

/**
 * `lastReadAt` is the `created_at` of the message at the cursor, not the time of the read — which
 * is exactly what makes "has my message been read" a comparison rather than a lookup.
 */
export function isReadByAnyone(entries: readonly ReadStateEntry[], message: ChatMessage, myId: string): boolean {
  if (!message.messageId) return false
  const createdAt = toMillis(message.createdAt)
  return entries.some((entry) => entry.userId !== myId && toMillis(entry.lastReadAt) >= createdAt)
}

export function seenByCount(entries: readonly ReadStateEntry[], message: ChatMessage, myId: string): number {
  if (!message.messageId) return 0
  const createdAt = toMillis(message.createdAt)
  return entries.filter((entry) => entry.userId !== myId && toMillis(entry.lastReadAt) >= createdAt).length
}

/** Apply an inbound `message.read` on top of the snapshot. The cursor only ever moves forward. */
export function applyReadFrame(
  qc: QueryClient,
  dialogId: string,
  entry: ReadStateEntry,
): void {
  qc.setQueryData<ReadStateResponse>(qk.readState(dialogId), (old) => {
    if (!old) return old
    const existing = old.entries.find((e) => e.userId === entry.userId)
    if (existing && toMillis(existing.lastReadAt) >= toMillis(entry.lastReadAt)) return old
    return {
      ...old,
      entries: [...old.entries.filter((e) => e.userId !== entry.userId), entry],
    }
  })
}
