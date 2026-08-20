/**
 * Presence: per-user status, and the set of dialogs this connection is subscribed to.
 *
 * Deliberately ephemeral and never persisted — subscriptions belong to the socket and die with it,
 * and a stored last-seen would be a fiction (the server never persists presence either).
 */

import { create } from 'zustand'
import type { Iso, PresenceUpdatePayload } from '@/lib/protocol/types'

export interface Presence {
  online: boolean
  /**
   * Null whenever it is not known — every `online` update, any peer the server never watched go
   * offline, and everything after a server restart. Null is NOT "a long time ago" (docs/REALTIME.md §5).
   */
  lastSeen: Iso | null
}

interface PresenceState {
  byUser: Record<string, Presence>
  /** Dialogs this connection has subscribed to. Cleared whenever the socket dies. */
  subscribed: string[]
  apply: (payload: PresenceUpdatePayload) => void
  markSubscribed: (dialogId: string) => void
  markUnsubscribed: (dialogId: string) => void
  clearSubscriptions: () => void
}

export const usePresenceStore = create<PresenceState>()((set) => ({
  byUser: {},
  subscribed: [],

  apply: (payload) =>
    set((s) => ({
      byUser: {
        ...s.byUser,
        [payload.user_id]: {
          // Anything that is not exactly `online` is offline — an unrecognised value is not an error.
          online: payload.status === 'online',
          lastSeen: payload.last_seen,
        },
      },
    })),

  markSubscribed: (dialogId) =>
    set((s) => (s.subscribed.includes(dialogId) ? s : { subscribed: [...s.subscribed, dialogId] })),

  markUnsubscribed: (dialogId) => set((s) => ({ subscribed: s.subscribed.filter((id) => id !== dialogId) })),

  clearSubscriptions: () => set({ subscribed: [] }),
}))
