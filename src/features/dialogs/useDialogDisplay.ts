import { useDialogPeerId } from '@/queries/useDialogs'
import { displayName, initialsOf, useUser } from '@/queries/useUser'
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
