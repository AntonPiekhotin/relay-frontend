import { useQueries } from '@tanstack/react-query'
import { peerIdOf, useDialogPeerId } from '@/queries/useDialogs'
import { displayName, initialsOf, useUser, userQueryOptions } from '@/queries/useUser'
import { useAuthStore } from '@/stores/authStore'
import type { DialogSummary } from '@/lib/api/types'

export interface DialogDisplay {
  name: string
  initials: string
  avatarUrl: string | null
  peerId: string | null
}

/**
 * What to draw for a dialog. A `direct` dialog has no title — subtract yourself from
 * `participantIds` and resolve the peer through `GET /user/{id}` (docs/MESSAGING.md §7). A group
 * carries `title`; its members still resolve through user-service.
 */
export function useDialogDisplay(dialog: DialogSummary | undefined): DialogDisplay {
  const peerId = useDialogPeerId(dialog)
  const peer = useUser(peerId)

  if (dialog?.type === 'group') {
    return {
      name: dialog.title ?? 'Group',
      initials: (dialog.title ?? 'G').trim().slice(0, 2).toUpperCase(),
      avatarUrl: null,
      peerId: null,
    }
  }

  return {
    name: peer.data ? displayName(peer.data) : peer.isLoading ? '' : 'Unknown user',
    initials: initialsOf(peer.data),
    avatarUrl: peer.data?.avatarUrl ?? null,
    peerId,
  }
}

/**
 * The names of a whole list of dialogs at once, for filtering it. A per-row `useDialogDisplay` is a
 * hook and so cannot be called over an array, and the peer of a `direct` dialog lives behind a
 * request — hence `useQueries`, sharing the exact cache entries the rows themselves read, so the
 * search costs no extra fetch.
 *
 * A dialog whose peer has not resolved yet maps to `''`: unknown, not "matches everything".
 */
export function useDialogNames(dialogs: readonly DialogSummary[]): Map<string, string> {
  const myId = useAuthStore((s) => s.userId)

  const peerIds = [...new Set(dialogs.map((d) => peerIdOf(d, myId)).filter((id): id is string => id !== null))]
  const peers = useQueries({ queries: peerIds.map((id) => userQueryOptions(id)) })

  const byPeerId = new Map<string, string>()
  peerIds.forEach((id, index) => {
    const peer = peers[index]?.data
    if (peer) byPeerId.set(id, displayName(peer))
  })

  return new Map(
    dialogs.map((dialog) => {
      if (dialog.type === 'group') return [dialog.dialogId, dialog.title ?? 'Group']
      const peerId = peerIdOf(dialog, myId)
      return [dialog.dialogId, (peerId ? byPeerId.get(peerId) : '') ?? '']
    }),
  )
}
