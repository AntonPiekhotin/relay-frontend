/**
 * Group calls invert the transport split: inbound is REST (join must return a room token
 * synchronously), media is the LiveKit SFU, and no SDP or ICE touches our wire at all. Only the
 * ringing and roster traffic still arrives as `call.signal` (docs/CALLS.md §2).
 *
 * Never send a group call's id in a `call.*` frame — that is `INVALID_REQUEST`.
 */

import type { Room } from 'livekit-client'
import { createGroupCall, declineGroupCall, joinGroupCall, leaveGroupCall } from '@/lib/api/calls'
import { friendlyError } from '@/lib/api/errors'
import { useCallStore } from '@/stores/callStore'
import { currentSessionId } from '@/stores/socketStore'
import { currentUserId } from '@/stores/authStore'
import type { GroupCallResponse } from '@/lib/api/types'
import type { CallMedia, CallSignalPayload, GroupCallParticipantWire } from '@/lib/protocol/types'
import { silenceRinging } from './ringing'
import { translate } from '@/lib/i18n'

type SignalOf<V extends string> = Extract<CallSignalPayload['signal'], { verb: V }>

let room: Room | null = null
/** Same window as the direct engine: `create`/`join` await REST and the SFU before state is set. */
let settingUp = false

export function getRoom(): Room | null {
  return room
}

/**
 * Group calls are NOT tied to group dialogs in the backend — the endpoint takes an ad-hoc
 * `inviteeIds` list. "Call this group" means reading the dialog's participants and passing them.
 */
export async function startGroupCall(inviteeIds: string[], media: CallMedia): Promise<void> {
  const store = useCallStore.getState()
  if (store.call.kind !== 'idle' || settingUp) return
  settingUp = true
  store.setError(null)

  const sessionId = currentSessionId()
  try {
    const call = await createGroupCall({
      // Client-generated, and a retried create with the same id is the same call, not a twin.
      callId: crypto.randomUUID(),
      media,
      inviteeIds,
      // Only excludes THIS device from its own `cancel` — which is what stops your other tab ringing.
      ...(sessionId ? { sessionId } : {}),
    })
    await enterRoom(call, media)
  } catch (error) {
    // Teardown first: `reset()` clears `error`, so setting it before would erase the message.
    teardownGroup()
    store.setError(friendlyError(error, translate().calls.couldNotStart))
  } finally {
    settingUp = false
  }
}

/** Join is legal from `invited`, `declined` and `left`; a terminal call answers 422. */
export async function joinIncomingGroupCall(): Promise<void> {
  const store = useCallStore.getState()
  const call = store.call
  if (call.kind !== 'group-ringing' || settingUp) return
  settingUp = true
  silenceRinging()

  const sessionId = currentSessionId()
  try {
    const joined = await joinGroupCall(call.callId, sessionId)
    await enterRoom(joined, call.media)
  } catch (error) {
    // Busy is decided at join, not at invite: a 409 here means this user is on another call.
    teardownGroup()
    store.setError(friendlyError(error, translate().calls.couldNotJoin))
  } finally {
    settingUp = false
  }
}

export async function declineIncomingGroupCall(reason = 'declined'): Promise<void> {
  const call = useCallStore.getState().call
  if (call.kind !== 'group-ringing') return
  silenceRinging()
  const sessionId = currentSessionId()
  await declineGroupCall(call.callId, reason, sessionId).catch(() => undefined)
  teardownGroup()
}

/** Idempotent — the SFU may have told the server first. */
export async function leaveCurrentGroupCall(): Promise<void> {
  const call = useCallStore.getState().call
  if (call.kind !== 'group') return
  const sessionId = currentSessionId()
  await leaveGroupCall(call.callId, sessionId).catch(() => undefined)
  teardownGroup()
}

export async function setGroupMicEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setMicrophoneEnabled(enabled)
  useCallStore.getState().setMic(enabled)
}

export async function setGroupCameraEnabled(enabled: boolean): Promise<void> {
  await room?.localParticipant.setCameraEnabled(enabled)
  useCallStore.getState().setCamera(enabled)
}

/** Roster and ringing verbs. Track subscriptions come from the SDK, never from these frames. */
export function handleGroupSignal(payload: CallSignalPayload): void {
  const store = useCallStore.getState()
  const call = store.call
  const signal = payload.signal

  switch (signal.verb) {
    case 'group_invite': {
      if (call.kind !== 'idle') return
      const invite = signal as SignalOf<'group_invite'>
      store.setCall({
        kind: 'group-ringing',
        callId: payload.call_id,
        from: payload.from_user_id,
        media: invite.media,
        ringExpiresAt: invite.ring_expires_at,
        roster: invite.participants,
      })
      return
    }

    case 'participant_joined':
      updateRoster(payload.call_id, (signal as SignalOf<'participant_joined'>).user_id, 'joined')
      return
    case 'participant_left':
      // A roster delta only — the call goes on.
      updateRoster(payload.call_id, (signal as SignalOf<'participant_left'>).user_id, 'left')
      return
    case 'participant_declined':
      updateRoster(payload.call_id, (signal as SignalOf<'participant_declined'>).user_id, 'declined')
      return
    case 'participant_missed':
      // Sent to everyone INCLUDING the missed invitee, so their own devices stop ringing on it.
      handleMissed(payload.call_id, (signal as SignalOf<'participant_missed'>).user_id)
      return

    case 'group_ended':
      if (activeGroupCallId() === payload.call_id) teardownGroup()
      return

    // `cancel` is reused unchanged from direct calls: another of your devices joined or declined.
    case 'cancel':
      if (call.kind === 'group-ringing' && call.callId === payload.call_id) teardownGroup()
      return

    default:
      return
  }
}

/** An `error` frame naming a group-call frame. Not retryable — drop the local call. */
export function failGroupCall(callId: string): void {
  if (activeGroupCallId() !== callId) return
  teardownGroup()
  useCallStore.getState().setError(translate().calls.callGone)
}

export function activeGroupCallId(): string | null {
  const call = useCallStore.getState().call
  return call.kind === 'group' || call.kind === 'group-ringing' ? call.callId : null
}

async function enterRoom(call: GroupCallResponse, media: CallMedia): Promise<void> {
  const store = useCallStore.getState()

  // `livekit` is present only where you are admitted to the room: create and join.
  if (!call.livekit) {
    teardownGroup()
    store.setError(translate().calls.notAdmitted)
    return
  }

  // Loaded on demand: the SDK is a large dependency and most sessions never place a group call.
  const { Room, RoomEvent } = await import('livekit-client')

  const next = new Room({ adaptiveStream: true, dynacast: true })
  room = next

  // The SDK owns who is publishing; a version bump is all the UI needs to re-read the room.
  const bump = () => useCallStore.getState().bumpMedia()
  next
    .on(RoomEvent.TrackSubscribed, bump)
    .on(RoomEvent.TrackUnsubscribed, bump)
    .on(RoomEvent.ParticipantConnected, bump)
    .on(RoomEvent.ParticipantDisconnected, bump)
    .on(RoomEvent.LocalTrackPublished, bump)
    .on(RoomEvent.Disconnected, () => teardownGroup())

  await next.connect(call.livekit.url, call.livekit.token)
  await next.localParticipant.setMicrophoneEnabled(true)
  if (media === 'video') await next.localParticipant.setCameraEnabled(true)

  store.setCall({
    kind: 'group',
    callId: call.callId,
    media,
    roster: call.participants.map((p) => ({ user_id: p.userId, state: p.state })),
  })
  store.setMic(true)
  store.setCamera(media === 'video')
  store.bumpMedia()
}

function updateRoster(callId: string, userId: string, state: GroupCallParticipantWire['state']): void {
  const store = useCallStore.getState()
  const call = store.call
  if ((call.kind !== 'group' && call.kind !== 'group-ringing') || call.callId !== callId) return

  const roster = call.roster.some((p) => p.user_id === userId)
    ? call.roster.map((p) => (p.user_id === userId ? { ...p, state } : p))
    : [...call.roster, { user_id: userId, state }]

  store.setCall({ ...call, roster })
}

function handleMissed(callId: string, userId: string): void {
  updateRoster(callId, userId, 'missed')

  // The frame goes to everyone including the invitee who rang out — which is how our own devices
  // learn to stop ringing without a timer of their own.
  const call = useCallStore.getState().call
  if (call.kind === 'group-ringing' && call.callId === callId && userId === currentUserId()) teardownGroup()
}

export function teardownGroup(): void {
  settingUp = false
  const leaving = room
  room = null
  void leaving?.disconnect().catch(() => undefined)

  const store = useCallStore.getState()
  if (store.call.kind === 'group' || store.call.kind === 'group-ringing') store.reset()
  store.bumpMedia()
}
