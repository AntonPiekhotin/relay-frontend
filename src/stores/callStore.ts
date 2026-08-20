/**
 * One active call at a time — the backend enforces that too, through the `active_calls` primary
 * key, so a second concurrent call is not a state worth modelling.
 *
 * Direct and group calls are kept apart in the state from the start. They share exactly one thing,
 * the outbound `call.signal` frame, and mixing their ids yields `INVALID_REQUEST` (docs/CALLS.md).
 *
 * The `RTCPeerConnection`, the LiveKit `Room` and the `MediaStream`s live in module scope in the
 * engine, never here: they are not serialisable, must never be persisted, and re-rendering must not
 * recreate them.
 */

import { create } from 'zustand'
import type { CallMedia, GroupCallParticipantWire, Iso } from '@/lib/protocol/types'

export type CallState =
  | { kind: 'idle' }
  | { kind: 'outgoing'; callId: string; peerId: string; media: CallMedia; ringExpiresAt: Iso | null }
  | { kind: 'incoming'; callId: string; from: string; media: CallMedia; sdp: string; ringExpiresAt: Iso }
  | { kind: 'connected'; callId: string; peerId: string; media: CallMedia; startedAt: number }
  | {
      kind: 'group-ringing'
      callId: string
      from: string
      media: CallMedia
      ringExpiresAt: Iso
      roster: GroupCallParticipantWire[]
    }
  | { kind: 'group'; callId: string; media: CallMedia; roster: GroupCallParticipantWire[] }

interface CallStoreState {
  call: CallState
  /** Bumped whenever a stream or track changes, so views re-attach without holding the objects. */
  mediaVersion: number
  micEnabled: boolean
  cameraEnabled: boolean
  /** User-facing, already translated. Never a raw error code. */
  error: string | null
  setCall: (call: CallState) => void
  bumpMedia: () => void
  setMic: (enabled: boolean) => void
  setCamera: (enabled: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useCallStore = create<CallStoreState>()((set) => ({
  call: { kind: 'idle' },
  mediaVersion: 0,
  micEnabled: true,
  cameraEnabled: true,
  error: null,
  setCall: (call) => set({ call }),
  bumpMedia: () => set((s) => ({ mediaVersion: s.mediaVersion + 1 })),
  setMic: (micEnabled) => set({ micEnabled }),
  setCamera: (cameraEnabled) => set({ cameraEnabled }),
  setError: (error) => set({ error }),
  reset: () => set({ call: { kind: 'idle' }, micEnabled: true, cameraEnabled: true, error: null }),
}))

export function currentCall(): CallState {
  return useCallStore.getState().call
}

/** The id of whatever call is live, direct or group. Null when idle. */
export function activeCallId(): string | null {
  const call = currentCall()
  return call.kind === 'idle' ? null : call.callId
}
