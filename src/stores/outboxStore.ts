/**
 * The outbox: one entry per unacked send.
 *
 * There is no REST send anywhere in this system, so a disconnected client cannot flush — it
 * queues. That makes the outbox not an optimisation but the entire offline story, which is why it
 * is persisted: an unacked message must survive a reload, and that is exactly what the idempotency
 * key is for (docs/MESSAGING.md §2).
 *
 * `clientMsgId` is minted once, here, and NEVER regenerated. A fresh id on the retry path creates a
 * second message on the server that nothing will ever clean up.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newFrameId } from '@/lib/protocol/codec'

/** Fifty pending in one dialog means something is badly wrong — stop accepting and say so. */
export const MAX_PENDING_PER_DIALOG = 50
/** No ack within this long → resend the same id. */
export const ACK_TIMEOUT_MS = 5_000
const MAX_RETRY_DELAY_MS = 60_000

export interface OutboxEntry {
  /** The idempotency key, and the envelope id of every send and resend of this message. */
  clientMsgId: string
  dialogId: string
  text: string
  state: 'PENDING' | 'FAILED'
  /** Optimistic ordering only — replaced by the server's authoritative `created_at` on ack. */
  createdAtLocal: number
  attempts: number
  /** Epoch millis. Meaningless while disconnected: retries only make sense against a live socket. */
  nextAttemptAt: number
  /** The error code that failed it, for the row's retry affordance. Never shown raw. */
  failureCode?: string
}

interface OutboxState {
  entries: Record<string, OutboxEntry>
  enqueue: (dialogId: string, text: string) => OutboxEntry | null
  markSent: (clientMsgId: string) => void
  markAttempted: (clientMsgId: string) => void
  markFailed: (clientMsgId: string, failureCode: string) => void
  retry: (clientMsgId: string) => void
  remove: (clientMsgId: string) => void
  clear: () => void
}

export const useOutboxStore = create<OutboxState>()(
  persist(
    (set, get) => ({
      entries: {},

      enqueue: (dialogId, text) => {
        // FAILED entries are on screen with a retry and a discard, so they are the user's problem,
        // not backpressure. Counting them would let fifty dead rows block a dialog for good.
        const pendingHere = Object.values(get().entries).filter(
          (e) => e.dialogId === dialogId && e.state === 'PENDING',
        )
        if (pendingHere.length >= MAX_PENDING_PER_DIALOG) return null

        const entry: OutboxEntry = {
          clientMsgId: newFrameId(),
          dialogId,
          text,
          state: 'PENDING',
          createdAtLocal: Date.now(),
          attempts: 0,
          nextAttemptAt: Date.now(),
        }
        set((s) => ({ entries: { ...s.entries, [entry.clientMsgId]: entry } }))
        return entry
      },

      // An ack removes the entry; the caller inserts the real row in the SAME update, or the
      // message flickers out of the list and back in.
      markSent: (clientMsgId) => get().remove(clientMsgId),

      markAttempted: (clientMsgId) =>
        set((s) => {
          const entry = s.entries[clientMsgId]
          if (!entry) return s
          const attempts = entry.attempts + 1
          return {
            entries: {
              ...s.entries,
              [clientMsgId]: { ...entry, attempts, nextAttemptAt: Date.now() + retryDelay(attempts) },
            },
          }
        }),

      markFailed: (clientMsgId, failureCode) =>
        set((s) => {
          const entry = s.entries[clientMsgId]
          if (!entry) return s
          return { entries: { ...s.entries, [clientMsgId]: { ...entry, state: 'FAILED', failureCode } } }
        }),

      retry: (clientMsgId) =>
        set((s) => {
          const entry = s.entries[clientMsgId]
          if (!entry) return s
          const rest: OutboxEntry = { ...entry, state: 'PENDING', attempts: 0, nextAttemptAt: Date.now() }
          delete rest.failureCode
          // Same clientMsgId. Always. That is the whole point of the design.
          return { entries: { ...s.entries, [clientMsgId]: rest } }
        }),

      remove: (clientMsgId) =>
        set((s) => {
          if (!s.entries[clientMsgId]) return s
          const entries = { ...s.entries }
          delete entries[clientMsgId]
          return { entries }
        }),

      clear: () => set({ entries: {} }),
    }),
    {
      name: 'relay.outbox',
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
)

/** ~5s, then doubling, capped at ~60s (docs/MESSAGING.md §1 step 6). */
export function retryDelay(attempts: number): number {
  return Math.min(ACK_TIMEOUT_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS)
}

export function outboxEntries(state: OutboxState): OutboxEntry[] {
  return Object.values(state.entries)
}

export function entriesForDialog(entries: Record<string, OutboxEntry>, dialogId: string): OutboxEntry[] {
  return Object.values(entries)
    .filter((entry) => entry.dialogId === dialogId)
    .sort((a, b) => a.createdAtLocal - b.createdAtLocal)
}

/** Entries due for a send right now. Called only when a socket exists — see `markAttempted`. */
export function dueEntries(entries: Record<string, OutboxEntry>, now = Date.now()): OutboxEntry[] {
  return Object.values(entries)
    .filter((entry) => entry.state === 'PENDING' && entry.nextAttemptAt <= now)
    .sort((a, b) => a.createdAtLocal - b.createdAtLocal)
}
