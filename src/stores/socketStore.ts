/**
 * Connection status and the session that belongs to it. Per-connection by definition, so this
 * store is deliberately NOT persisted — a stale `sessionId` outliving its socket is a bug source.
 */

import { create } from 'zustand'
import type { SocketStatus } from '@/lib/protocol/socket'

interface SocketState {
  status: SocketStatus
  /** From `session.connected`. Identifies THIS connection — phone and web have two. */
  sessionId: string | null
  /** The identity the server resolved from the token. Confirm it matches who we think we are. */
  sessionUserId: string | null
  setStatus: (status: SocketStatus) => void
  setSession: (sessionId: string, userId: string) => void
  clearSession: () => void
}

export const useSocketStore = create<SocketState>()((set) => ({
  status: 'idle',
  sessionId: null,
  sessionUserId: null,
  // Anything but `ready` means the session is gone: subscriptions, the session id, and every
  // in-flight expectation belonged to that connection and nothing is remembered for us.
  setStatus: (status) => set(status === 'ready' ? { status } : { status, sessionId: null, sessionUserId: null }),
  setSession: (sessionId, sessionUserId) => set({ sessionId, sessionUserId }),
  clearSession: () => set({ sessionId: null, sessionUserId: null }),
}))

/** The group-call REST endpoints take this to exclude this device from its own `cancel`. */
export function currentSessionId(): string | null {
  return useSocketStore.getState().sessionId
}

export function isSocketReady(): boolean {
  return useSocketStore.getState().status === 'ready'
}
