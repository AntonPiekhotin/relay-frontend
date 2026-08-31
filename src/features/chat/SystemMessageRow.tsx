import { displayName, useUser } from '@/queries/useUser'
import type { ChatMessage } from '@/lib/chat/message'
import { useT, type Messages } from '@/lib/i18n'

export interface SystemMessageRowProps {
  message: ChatMessage
  /** The dialog's current title, for kinds that talk about the group itself. */
  dialogTitle?: string | null | undefined
}

/**
 * A system message is structured and never rendered server-side: the server holds ids only, and the
 * sentence is composed here from resolved names (docs/MESSAGING.md §6).
 *
 * Unknown kinds get a neutral placeholder — never a throw. The server may add kinds.
 *
 * It lives in `chat/` rather than `groups/` because the message list renders it, and a feature
 * folder may not import from another feature folder (docs/ARCHITECTURE.md §3).
 */
export function SystemMessageRow({ message, dialogTitle }: SystemMessageRowProps) {
  const t = useT()
  const actor = useUser(message.senderId)
  const target = useUser(message.targetUserId)

  const actorName = actor.data ? displayName(actor.data) : t.system.someone
  const targetName = target.data ? displayName(target.data) : t.system.someoneObject
  const title = message.title ?? dialogTitle ?? t.system.theGroup

  return (
    <li className="flex justify-center">
      <p className="rounded-full bg-surface-raised px-3 py-1 text-center text-xs text-fg-muted">
        {sentenceFor(t, message.kind, actorName, targetName, title)}
      </p>
    </li>
  )
}

function sentenceFor(t: Messages, kind: string, actor: string, target: string, title: string): string {
  switch (kind) {
    case 'group_created':
      return t.system.created(actor, title)
    case 'group_renamed':
      return t.system.renamed(actor, title)
    case 'member_added':
      return t.system.memberAdded(actor, target)
    case 'member_removed':
      return t.system.memberRemoved(actor, target)
    case 'member_left':
      return t.system.memberLeft(actor)
    default:
      return t.system.updated(actor)
  }
}
