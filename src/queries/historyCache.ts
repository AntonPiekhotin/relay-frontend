/**
 * Cache surgery for socket frames.
 *
 * A `message.new` already carries the whole row, so it is written into the cache with
 * `setQueryData`. Invalidating would refetch a page the server just handed us, turning every
 * inbound message into an HTTP request (docs/REALTIME.md §4).
 *
 * Nothing here renders, and nothing here calls React — a frame handler updates a cache entry and
 * returns, which is what makes the whole layer testable without a DOM.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { DialogListResponse, DialogSummary, HistoryMessage } from '@/lib/api/types'
import type { ChatMessage } from '@/lib/chat/message'
import { toMillis } from '@/lib/time'
import { sortDialogs } from './useDialogs'
import type { HistoryQueryData } from './useHistory'
import { qk } from './keys'

type DialogsQueryData = { pages: DialogListResponse[]; pageParams: unknown[] }

function toHistoryRow(message: ChatMessage): HistoryMessage {
  const row: HistoryMessage = {
    messageId: message.messageId ?? '',
    dialogId: message.dialogId,
    senderId: message.senderId,
    text: message.text,
    createdAt: message.createdAt,
    kind: message.kind,
    targetUserId: message.targetUserId,
  }
  // `clientMsgId` is present only on your own rows — never write an empty one, or the merge would
  // key other people's messages on it.
  return message.clientMsgId ? { ...row, clientMsgId: message.clientMsgId } : row
}

/**
 * Insert server-assigned rows into a dialog's history cache.
 *
 * When no page is cached the message is dropped on purpose: the dialog is not open, its history
 * will be fetched fresh when it is, and seeding a lone page here would make `useInfiniteQuery`
 * believe it had reached the end of history.
 */
export function insertHistoryMessages(qc: QueryClient, dialogId: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return

  qc.setQueryData<HistoryQueryData>(qk.history(dialogId), (old) => {
    if (!old || old.pages.length === 0) return old

    const pages = old.pages.map((page) => ({ ...page, messages: [...page.messages] }))
    const locate = (predicate: (row: HistoryMessage) => boolean): [number, number] | null => {
      for (let p = 0; p < pages.length; p++) {
        const index = pages[p]?.messages.findIndex(predicate) ?? -1
        if (index >= 0) return [p, index]
      }
      return null
    }

    for (const message of messages) {
      const row = toHistoryRow(message)
      const found =
        (message.clientMsgId ? locate((r) => r.clientMsgId === message.clientMsgId) : null) ??
        (message.messageId ? locate((r) => r.messageId === message.messageId) : null)

      if (found) {
        const [pageIndex, rowIndex] = found
        const page = pages[pageIndex]
        if (page) page.messages[rowIndex] = { ...page.messages[rowIndex], ...row }
        continue
      }

      // Page 0 holds the newest rows; that is where anything new belongs.
      const head = pages[0]
      if (!head) continue
      head.messages = [row, ...head.messages].sort((a, b) => {
        const byTime = toMillis(b.createdAt) - toMillis(a.createdAt)
        return byTime !== 0 ? byTime : b.messageId.localeCompare(a.messageId)
      })
    }

    return { ...old, pages }
  })
}

/** The newest message id in a dialog's cache that the SERVER assigned — the catch-up cursor. */
export function newestServerMessageId(qc: QueryClient, dialogId: string): string | null {
  const data = qc.getQueryData<HistoryQueryData>(qk.history(dialogId))
  const head = data?.pages[0]?.messages
  if (!head || head.length === 0) return null

  let newest: HistoryMessage | undefined
  for (const row of head) {
    if (!row.messageId) continue
    if (!newest || toMillis(row.createdAt) > toMillis(newest.createdAt)) newest = row
  }
  return newest?.messageId ?? null
}

/** Every dialog id we hold local history for — step 4 of the reconnect sequence works from this. */
export function dialogsWithLocalHistory(qc: QueryClient): string[] {
  return qc
    .getQueryCache()
    .findAll({ queryKey: ['history'] })
    .map((query) => query.queryKey[1])
    .filter((id): id is string => typeof id === 'string')
}

function mapDialogs(qc: QueryClient, fn: (dialog: DialogSummary) => DialogSummary | null): void {
  qc.setQueryData<DialogsQueryData>(qk.dialogs, (old) => {
    if (!old) return old
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        dialogs: page.dialogs.map(fn).filter((d): d is DialogSummary => d !== null),
      })),
    }
  })
}

/**
 * Move a dialog to the top of the list and, when the message is somebody else's, raise its unread
 * count. Your own messages never count toward unread.
 */
export function bumpDialog(
  qc: QueryClient,
  dialogId: string,
  options: { lastMessageAt: string; incrementUnread: boolean },
): void {
  let found = false
  mapDialogs(qc, (dialog) => {
    if (dialog.dialogId !== dialogId) return dialog
    found = true
    return {
      ...dialog,
      lastMessageAt: options.lastMessageAt,
      unreadCount: options.incrementUnread ? dialog.unreadCount + 1 : dialog.unreadCount,
    }
  })

  // A message in a dialog we have never seen — somebody started a conversation with us. The list
  // is the only place that can tell us what it is, so this is the one case worth a refetch.
  if (!found) void qc.invalidateQueries({ queryKey: qk.dialogs })
}

export function setDialogUnread(qc: QueryClient, dialogId: string, unreadCount: number): void {
  mapDialogs(qc, (dialog) => (dialog.dialogId === dialogId ? { ...dialog, unreadCount } : dialog))
}

export function upsertDialog(qc: QueryClient, dialog: DialogSummary): void {
  qc.setQueryData(qk.dialog(dialog.dialogId), dialog)
  let replaced = false
  mapDialogs(qc, (existing) => {
    if (existing.dialogId !== dialog.dialogId) return existing
    replaced = true
    return { ...existing, ...dialog }
  })
  if (replaced) return

  qc.setQueryData<DialogsQueryData>(qk.dialogs, (old) => {
    if (!old) return old
    const [head, ...rest] = old.pages
    if (!head) return old
    return { ...old, pages: [{ ...head, dialogs: sortDialogs([dialog, ...head.dialogs]) }, ...rest] }
  })
}

/** Drop a dialog and everything cached about it — `dialog.deleted`, or a `member_removed` naming you. */
export function dropDialog(qc: QueryClient, dialogId: string): void {
  mapDialogs(qc, (dialog) => (dialog.dialogId === dialogId ? null : dialog))
  qc.removeQueries({ queryKey: qk.history(dialogId) })
  qc.removeQueries({ queryKey: qk.dialog(dialogId) })
  qc.removeQueries({ queryKey: qk.readState(dialogId) })
}
