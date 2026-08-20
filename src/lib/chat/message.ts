/**
 * The domain message and the merge.
 *
 * A message can reach the UI four ways — the optimistic local row, an `ack`, a `message.new` from
 * another device, and a history row — and the list must show ONE row regardless of the order they
 * arrive in (docs/MESSAGING.md §3).
 *
 * The rule, in one sentence: if the incoming row has a `clientMsgId` that matches a local entry,
 * replace it; otherwise deduplicate on `messageId`.
 */

import type { HistoryMessage } from '@/lib/api/types'
import type { Iso, MessageNewPayload, MessageSystemPayload } from '@/lib/protocol/types'
import type { OutboxEntry } from '@/stores/outboxStore'
import { toMillis } from '@/lib/time'

export const USER_MESSAGE_KIND = 'user'

/** There is no `DELIVERED`: nothing in the protocol would ever set it (docs/MESSAGING.md §1). */
export type MessageState = 'PENDING' | 'SENT' | 'FAILED'

export interface ChatMessage {
  /** Null only while the message is still PENDING — the server has not assigned one yet. */
  messageId: string | null
  /** Present on your own messages only. Absent on other people's rows and on system rows. */
  clientMsgId: string | null
  dialogId: string
  /** The actor on a system row. */
  senderId: string
  text: string
  createdAt: Iso
  /** `user`, or a system kind. Unknown values are rendered neutrally, never thrown on. */
  kind: string
  targetUserId: string | null
  state: MessageState
  /** The dialog's current title — only carried by a `message.system` frame. */
  title?: string | null
}

export function isSystemMessage(message: ChatMessage): boolean {
  return message.kind !== USER_MESSAGE_KIND
}

export function fromHistoryRow(row: HistoryMessage): ChatMessage {
  return {
    // `text` is empty on system rows EXCEPT `group_renamed`, which carries the new title there.
    // Without this, every historical rename re-renders with the group's current name after a reload.
    title: row.kind === 'group_renamed' ? row.text : null,
    messageId: row.messageId,
    clientMsgId: row.clientMsgId ?? null,
    dialogId: row.dialogId,
    senderId: row.senderId,
    text: row.text,
    createdAt: row.createdAt,
    kind: row.kind,
    targetUserId: row.targetUserId,
    state: 'SENT',
  }
}

export function fromMessageNew(payload: MessageNewPayload): ChatMessage {
  return {
    messageId: payload.message_id,
    clientMsgId: null,
    dialogId: payload.dialog_id,
    senderId: payload.sender_id,
    text: payload.text,
    createdAt: payload.created_at,
    kind: USER_MESSAGE_KIND,
    targetUserId: null,
    state: 'SENT',
  }
}

export function fromMessageSystem(payload: MessageSystemPayload): ChatMessage {
  return {
    messageId: payload.message_id,
    clientMsgId: null,
    dialogId: payload.dialog_id,
    senderId: payload.actor_id,
    text: '',
    createdAt: payload.created_at,
    kind: payload.kind,
    targetUserId: payload.target_user_id,
    state: 'SENT',
    title: payload.title,
  }
}

/**
 * Sort by `(createdAt, messageId)`, never by arrival order.
 *
 * The tiebreaker is not decoration: rapid sends share a millisecond, the backend's own history
 * cursor compares `(sent_at, id)` as a row value for that reason, and a sort on the timestamp
 * alone renders two messages in an unstable order.
 */
export function compareMessages(a: ChatMessage, b: ChatMessage): number {
  const byTime = toMillis(a.createdAt) - toMillis(b.createdAt)
  if (byTime !== 0) return byTime
  return (a.messageId ?? a.clientMsgId ?? '').localeCompare(b.messageId ?? b.clientMsgId ?? '')
}

/** Between two views of the same message, the one carrying a server id wins. */
function preferServer(existing: ChatMessage, incoming: ChatMessage): ChatMessage {
  if (incoming.messageId && !existing.messageId) return incoming
  if (existing.messageId && !incoming.messageId) return existing
  return incoming
}

/**
 * Merge rows into a list, deduplicating and sorting. Receiving a message you already hold is
 * normal, not an error.
 */
export function mergeMessages(existing: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const merged = [...existing]
  const byId = new Map<string, number>()
  const byClientId = new Map<string, number>()

  merged.forEach((message, index) => {
    if (message.messageId) byId.set(message.messageId, index)
    if (message.clientMsgId) byClientId.set(message.clientMsgId, index)
  })

  for (const row of incoming) {
    const clientIndex = row.clientMsgId !== null ? byClientId.get(row.clientMsgId) : undefined
    const idIndex = row.messageId !== null ? byId.get(row.messageId) : undefined
    const index = clientIndex ?? idIndex

    if (index !== undefined) {
      const previous = merged[index]
      if (!previous) continue
      const next = preferServer(previous, row)
      // A history row for one of your own messages carries the clientMsgId; keep it either way so
      // a later ack still finds the row.
      merged[index] = { ...next, clientMsgId: next.clientMsgId ?? previous.clientMsgId }
      if (next.messageId) byId.set(next.messageId, index)
      if (merged[index]?.clientMsgId) byClientId.set(merged[index].clientMsgId as string, index)
      continue
    }

    merged.push(row)
    const added = merged.length - 1
    if (row.messageId) byId.set(row.messageId, added)
    if (row.clientMsgId) byClientId.set(row.clientMsgId, added)
  }

  return merged.sort(compareMessages)
}

/** An unacked send, as a row in the list: no `messageId` yet, and its own PENDING/FAILED state. */
export function fromOutboxEntry(entry: OutboxEntry, myId: string): ChatMessage {
  return {
    messageId: null,
    clientMsgId: entry.clientMsgId,
    dialogId: entry.dialogId,
    senderId: myId,
    text: entry.text,
    createdAt: new Date(entry.createdAtLocal).toISOString(),
    kind: USER_MESSAGE_KIND,
    targetUserId: null,
    state: entry.state,
  }
}
