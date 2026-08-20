/**
 * The dialog list. Keyset-paginated by `cursor`, ordered by `lastMessageAt` desc with nulls LAST —
 * a dialog nobody has written in has never happened, which is not the same as long ago.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { getDialog, getDialogs } from '@/lib/api/dialogs'
import type { DialogListResponse, DialogSummary } from '@/lib/api/types'
import { toMillis } from '@/lib/time'
import { useAuthStore } from '@/stores/authStore'
import { qk } from './keys'

const PAGE_LIMIT = 100

export function sortDialogs(dialogs: readonly DialogSummary[]): DialogSummary[] {
  return [...dialogs].sort((a, b) => {
    if (a.lastMessageAt === null && b.lastMessageAt === null) {
      return toMillis(b.createdAt) - toMillis(a.createdAt)
    }
    if (a.lastMessageAt === null) return 1
    if (b.lastMessageAt === null) return -1
    return toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt)
  })
}

export function useDialogs() {
  return useInfiniteQuery<DialogListResponse, Error, DialogSummary[], readonly string[], string | null>({
    queryKey: qk.dialogs,
    initialPageParam: null,
    queryFn: ({ pageParam }) => getDialogs(pageParam, PAGE_LIMIT),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data: InfiniteData<DialogListResponse, string | null>) =>
      sortDialogs(data.pages.flatMap((page) => page.dialogs)),
  })
}

/** A single dialog, for the chat header. Reads the list's cache first so opening one is instant. */
export function useDialog(dialogId: string | undefined) {
  return useQuery<DialogSummary>({
    queryKey: qk.dialog(dialogId ?? ''),
    queryFn: () => getDialog(dialogId as string),
    enabled: Boolean(dialogId),
  })
}

/**
 * A `direct` dialog has no title: name it by subtracting yourself from `participantIds`. Returns
 * null for a group, and for the degenerate case of a direct dialog with only you in it.
 */
export function peerIdOf(dialog: DialogSummary | undefined, myId: string | null): string | null {
  if (!dialog || dialog.type !== 'direct') return null
  return dialog.participantIds.find((id) => id !== myId) ?? null
}

export function useDialogPeerId(dialog: DialogSummary | undefined): string | null {
  const myId = useAuthStore((s) => s.userId)
  return peerIdOf(dialog, myId)
}
