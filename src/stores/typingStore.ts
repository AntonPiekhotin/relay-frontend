/**
 * Who is typing where.
 *
 * There is no `typing.stop` frame and there never will be — a stop lost on a dropped socket would
 * leave somebody typing forever. So every received indicator expires locally after ~5s, and is
 * cleared immediately when that user's message arrives (docs/REALTIME.md §6).
 */

import { create } from 'zustand'

/** Slightly longer than the 3s send throttle, so a steady typist does not flicker. */
export const TYPING_EXPIRY_MS = 5_000

interface TypingState {
  /** dialogId → userId → the epoch millis at which the indicator expires. */
  byDialog: Record<string, Record<string, number>>
  start: (dialogId: string, userId: string) => void
  stop: (dialogId: string, userId: string) => void
  sweep: () => void
  clear: () => void
}

export const useTypingStore = create<TypingState>()((set) => ({
  byDialog: {},

  start: (dialogId, userId) =>
    set((s) => ({
      byDialog: {
        ...s.byDialog,
        [dialogId]: { ...s.byDialog[dialogId], [userId]: Date.now() + TYPING_EXPIRY_MS },
      },
    })),

  stop: (dialogId, userId) =>
    set((s) => {
      const dialog = s.byDialog[dialogId]
      if (!dialog || !(userId in dialog)) return s
      const next = { ...dialog }
      delete next[userId]
      return { byDialog: { ...s.byDialog, [dialogId]: next } }
    }),

  /** One sweep for the whole app beats a timer per user per dialog. */
  sweep: () =>
    set((s) => {
      const now = Date.now()
      let changed = false
      const byDialog: Record<string, Record<string, number>> = {}

      for (const [dialogId, users] of Object.entries(s.byDialog)) {
        const live: Record<string, number> = {}
        for (const [userId, expiresAt] of Object.entries(users)) {
          if (expiresAt > now) live[userId] = expiresAt
          else changed = true
        }
        byDialog[dialogId] = live
      }

      return changed ? { byDialog } : s
    }),

  clear: () => set({ byDialog: {} }),
}))

export function typistsIn(byDialog: Record<string, Record<string, number>>, dialogId: string): string[] {
  const users = byDialog[dialogId]
  if (!users) return []
  const now = Date.now()
  return Object.entries(users)
    .filter(([, expiresAt]) => expiresAt > now)
    .map(([userId]) => userId)
}
