/**
 * Catch-up: the reason the gateway is allowed to drop frames.
 *
 * The server buffers nothing for offline clients — no replay, no server-side outbox, no "missed
 * messages" frame. A gap is closed by asking REST what happened after the newest message we hold,
 * and that is the correctness mechanism the whole delivery design leans on (docs/REALTIME.md §3).
 */

import type { QueryClient } from '@tanstack/react-query'
import { getHistoryAfter } from '@/lib/api/messages'
import { fromHistoryRow } from '@/lib/chat/message'
import { dialogsWithLocalHistory, insertHistoryMessages, newestServerMessageId } from '@/queries/historyCache'
import { qk } from '@/queries/keys'

/** `after` pages are clamped to 100, never rejected. */
const CATCH_UP_PAGE_SIZE = 100

/**
 * Page forward until a page comes back short.
 *
 * The cursor must be a message id the SERVER assigned — an optimistic local id is a 400, because
 * the server has never heard of it. `after` pages arrive ASCENDING, unlike everything else, so the
 * newest row is the last one.
 */
export async function catchUpDialog(qc: QueryClient, dialogId: string): Promise<number> {
  let cursor = newestServerMessageId(qc, dialogId)
  if (!cursor) return 0

  let recovered = 0
  for (;;) {
    const page = await getHistoryAfter(dialogId, cursor, CATCH_UP_PAGE_SIZE)
    if (page.messages.length === 0) return recovered

    insertHistoryMessages(qc, dialogId, page.messages.map(fromHistoryRow))
    recovered += page.messages.length

    const newest = page.messages[page.messages.length - 1]
    if (!newest || page.messages.length < CATCH_UP_PAGE_SIZE) return recovered
    cursor = newest.messageId
  }
}

export interface ReconnectOptions {
  /** The conversation on screen. Caught up first — the rest can wait until they are opened. */
  openDialogId?: string | null
  /** Step 5: reads taken while offline. Owned by the read layer. */
  resendReads?: () => void
  /** Step 6: subscriptions belong to the dead connection and are never remembered for us. */
  resubscribePresence?: () => void
  /** Step 5: the outbox, flushed with the same clientMsgIds. */
  flushOutbox?: () => void
}

/**
 * The six-step recovery, run after every `session.connected`. Skipping a step silently loses data.
 *
 * Step 3 is what makes a conversation somebody else started visible at all; without it a dialog id
 * only ever existed on the device that opened it.
 */
export async function runReconnectSequence(qc: QueryClient, options: ReconnectOptions = {}): Promise<void> {
  // 3. The authoritative dialog list, with authoritative unread counts.
  await qc.refetchQueries({ queryKey: qk.dialogs, type: 'active' }).catch(() => undefined)

  // 4. Close the gap in every dialog we hold local history for, open one first. Catching up a
  //    hundred dialogs is a hundred requests, and the dialog list already gave us correct counts
  //    for the ones nobody is looking at.
  const dialogIds = dialogsWithLocalHistory(qc)
  const ordered = options.openDialogId
    ? [options.openDialogId, ...dialogIds.filter((id) => id !== options.openDialogId)]
    : dialogIds

  for (const dialogId of ordered) {
    // One failed dialog must not abort the recovery of the others.
    await catchUpDialog(qc, dialogId).catch(() => 0)
  }

  // 5. Flush the outbox with the same clientMsgIds, and resend reads taken while offline.
  options.flushOutbox?.()
  options.resendReads?.()

  // 6. Re-subscribe presence for whatever is on screen.
  options.resubscribePresence?.()
}
