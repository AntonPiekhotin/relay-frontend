/**
 * Direct (1:1) calls: WebRTC over our own signaling frames.
 *
 * The peer connection and both media streams live in module scope, deliberately outside React —
 * they are not serialisable, must never be persisted, and re-rendering must not recreate them
 * (docs/CALLS.md §3).
 *
 * SDP and ICE candidates are opaque. They are passed through untouched; the server never parses
 * them and neither do we.
 */

import { getIceServers } from '@/lib/api/calls'
import { sendCallFrame } from '@/lib/realtime/connection'
import { useCallStore } from '@/stores/callStore'
import type {
  CallSignal,
  CallAcceptPayload,
  CallHangupPayload,
  CallIcePayload,
  CallInvitePayload,
  CallMedia,
  CallRejectPayload,
  CallSignalPayload,
} from '@/lib/protocol/types'
import { acquireLocalMedia, mediaErrorMessage, stopStream } from './media'

/**
 * `CallSignal` ends in an open `{ verb: string; [key: string]: unknown }` member so an unknown verb
 * is representable rather than a parse failure — which also means `switch` cannot narrow it. This
 * picks the member for a known verb once it has been matched.
 */
type SignalOf<V extends string> = Extract<CallSignal, { verb: V }>

let pc: RTCPeerConnection | null = null
let localStream: MediaStream | null = null
let remoteStream: MediaStream | null = null
/** Candidates that arrived before the remote description existed. Applying one early throws. */
let bufferedCandidates: RTCIceCandidateInit[] = []
/**
 * Setting up a call spans `getUserMedia`, `GET /call/ice-servers` and `createOffer`, so the store
 * still says `idle` while it runs. Without this, a second click starts a second call: two invites,
 * two peer connections, and a first `MediaStream` nothing ever stops — a camera light that stays
 * on for the rest of the session.
 */
let settingUp = false

export function getLocalStream(): MediaStream | null {
  return localStream
}

export function getRemoteStream(): MediaStream | null {
  return remoteStream
}

/** Place a call. The client generates `call_id` — trickle ICE starts before any round trip. */
export async function startDirectCall(peerId: string, media: CallMedia, dialogId?: string): Promise<void> {
  const store = useCallStore.getState()
  if (store.call.kind !== 'idle' || settingUp) return
  settingUp = true

  const callId = crypto.randomUUID()
  store.setError(null)

  try {
    localStream = await acquireLocalMedia(media)
  } catch (error) {
    settingUp = false
    store.setError(mediaErrorMessage(error))
    return
  }

  try {
    await createPeerConnection(callId)
    if (!pc) return

    for (const track of localStream.getTracks()) pc.addTrack(track, localStream)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // Never send a caller id: the caller and the device come from the authenticated socket.
    const payload: CallInvitePayload = {
      call_id: callId,
      callee_id: peerId,
      media,
      sdp: offer.sdp ?? '',
      ...(dialogId ? { dialog_id: dialogId } : {}),
    }

    if (!sendCallFrame<CallInvitePayload>('call.invite', payload, callId)) {
      endCall('Could not reach the server.')
      return
    }

    // `ring_expires_at` arrives on the `state` verb; until then there is no honest deadline to show.
    store.setCall({ kind: 'outgoing', callId, peerId, media, ringExpiresAt: null })
    store.setMic(true)
    store.setCamera(media === 'video')
    store.bumpMedia()
  } catch {
    endCall('Could not start the call.')
  } finally {
    settingUp = false
  }
}

/**
 * Answer. The click that calls this IS the user gesture some browsers require before remote audio
 * may play, which is why media is attached from here rather than from a later effect.
 */
export async function acceptIncomingCall(): Promise<void> {
  const store = useCallStore.getState()
  const call = store.call
  if (call.kind !== 'incoming' || settingUp) return
  settingUp = true

  try {
    localStream = await acquireLocalMedia(call.media)
  } catch (error) {
    settingUp = false
    rejectIncomingCall('media_unavailable')
    store.setError(mediaErrorMessage(error))
    return
  }

  try {
    await createPeerConnection(call.callId)
    if (!pc) return

    for (const track of localStream.getTracks()) pc.addTrack(track, localStream)

    await pc.setRemoteDescription({ type: 'offer', sdp: call.sdp })
    await drainBufferedCandidates()

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    if (
      !sendCallFrame<CallAcceptPayload>(
        'call.accept',
        { call_id: call.callId, sdp: answer.sdp ?? '' },
        call.callId,
      )
    ) {
      endCall('Could not reach the server.')
      return
    }

    store.setCall({
      kind: 'connected',
      callId: call.callId,
      peerId: call.from,
      media: call.media,
      startedAt: Date.now(),
    })
    store.setMic(true)
    store.setCamera(call.media === 'video')
    store.bumpMedia()
  } catch {
    endCall('Could not answer the call.')
  } finally {
    settingUp = false
  }
}

export function rejectIncomingCall(reason?: string): void {
  const call = useCallStore.getState().call
  if (call.kind !== 'incoming') return
  sendCallFrame<CallRejectPayload>(
    'call.reject',
    { call_id: call.callId, ...(reason ? { reason } : {}) },
    call.callId,
  )
  teardown()
}

export function hangUpDirectCall(reason?: string): void {
  const call = useCallStore.getState().call
  if (call.kind !== 'outgoing' && call.kind !== 'connected') return
  sendCallFrame<CallHangupPayload>(
    'call.hangup',
    { call_id: call.callId, ...(reason ? { reason } : {}) },
    call.callId,
  )
  teardown()
}

export function setMicEnabled(enabled: boolean): void {
  for (const track of localStream?.getAudioTracks() ?? []) track.enabled = enabled
  useCallStore.getState().setMic(enabled)
}

export function setCameraEnabled(enabled: boolean): void {
  for (const track of localStream?.getVideoTracks() ?? []) track.enabled = enabled
  useCallStore.getState().setCamera(enabled)
}

/** Inbound `call.signal` for a direct call. An unrecognised verb ignores one signal, never throws. */
export async function handleDirectSignal(payload: CallSignalPayload): Promise<void> {
  try {
    await routeDirectSignal(payload)
  } catch {
    // A rejected SDP or candidate leaves the negotiation half-finished, and nothing about a call
    // is retryable — so tear it down rather than ringing forever with live media.
    if (activeDirectCallId() === payload.call_id) endCall('The call could not be set up.')
  }
}

async function routeDirectSignal(payload: CallSignalPayload): Promise<void> {
  const store = useCallStore.getState()
  const call = store.call
  const signal = payload.signal

  switch (signal.verb) {
    case 'invite': {
      // Already busy? The server answers the caller with USER_BUSY; nothing to do here but ignore.
      if (call.kind !== 'idle') return
      const invite = signal as SignalOf<'invite'>
      store.setCall({
        kind: 'incoming',
        callId: payload.call_id,
        from: payload.from_user_id,
        media: invite.media,
        sdp: invite.sdp,
        ringExpiresAt: invite.ring_expires_at,
      })
      return
    }

    case 'state': {
      // Currently only "your invite reached ringing". Nothing to change but the label.
      return
    }

    case 'accept': {
      if (call.kind !== 'outgoing' || call.callId !== payload.call_id || !pc) return
      await pc.setRemoteDescription({ type: 'answer', sdp: (signal as SignalOf<'accept'>).sdp })
      await drainBufferedCandidates()
      store.setCall({
        kind: 'connected',
        callId: call.callId,
        peerId: call.peerId,
        media: call.media,
        startedAt: Date.now(),
      })
      store.bumpMedia()
      return
    }

    case 'ice': {
      if (activeDirectCallId() !== payload.call_id) return
      // A candidate before the remote description exists is normal — that is what trickle ICE is.
      const { candidate } = signal as SignalOf<'ice'>
      if (!pc?.remoteDescription) {
        bufferedCandidates.push(candidate)
        return
      }
      await pc.addIceCandidate(candidate).catch(() => undefined)
      return
    }

    case 'reject':
      if (activeDirectCallId() === payload.call_id) endCall(null)
      return

    case 'hangup':
      if (activeDirectCallId() === payload.call_id) endCall(null)
      return

    case 'missed':
      if (activeDirectCallId() === payload.call_id) endCall(null)
      return

    /**
     * Another of YOUR devices settled it — stop ringing. Skipping this is a visible bug: answer on
     * the laptop and the phone rings forever. The device that acted never receives it.
     */
    case 'cancel':
      if (activeDirectCallId() === payload.call_id) endCall(null)
      return

    default:
      // Unknown verb: ignore one signal rather than failing to route a frame.
      return
  }
}

/**
 * An `error` frame answering one of our call frames. Nothing about a call is retryable: by the time
 * a signal has failed, replaying it negotiates against a peer that has moved on.
 */
export function failDirectCall(callId: string, code: string): void {
  if (activeDirectCallId() !== callId) return
  endCall(directCallErrorMessage(code))
}

function directCallErrorMessage(code: string): string {
  switch (code) {
    case 'USER_BUSY':
      return 'They are already on another call.'
    case 'CALL_NOT_FOUND':
    case 'INVALID_CALL_STATE':
      return 'That call is no longer available.'
    case 'NOT_A_PARTICIPANT':
      return 'You are not part of that call.'
    default:
      return 'The call could not be connected.'
  }
}

function activeDirectCallId(): string | null {
  const call = useCallStore.getState().call
  if (call.kind === 'outgoing' || call.kind === 'incoming' || call.kind === 'connected') return call.callId
  return null
}

async function createPeerConnection(callId: string): Promise<void> {
  // TURN credentials are minted per request and expire — fetched per call, never cached.
  const { iceServers } = await getIceServers()
  const connection = new RTCPeerConnection({ iceServers })
  pc = connection
  remoteStream = new MediaStream()
  // The buffer is NOT cleared here. Candidates the caller trickled while this side had no peer
  // connection are exactly what it holds, and they are drained right after `setRemoteDescription`.
  // Clearing here would silently discard the caller's whole gathered set. It is cleared on teardown.

  connection.onicecandidate = (event) => {
    if (!event.candidate) return
    // Trickle: candidates go out immediately. The server buffers them ~5s if the callee has not
    // seen the invite yet, which is exactly the expected ordering.
    sendCallFrame<CallIcePayload>('call.ice', { call_id: callId, candidate: event.candidate.toJSON() }, callId)
  }

  connection.ontrack = (event) => {
    for (const track of event.streams[0]?.getTracks() ?? [event.track]) remoteStream?.addTrack(track)
    useCallStore.getState().bumpMedia()
  }

  connection.onconnectionstatechange = () => {
    if (connection.connectionState === 'failed') endCall('The connection dropped.')
  }
}

async function drainBufferedCandidates(): Promise<void> {
  if (!pc) return
  const candidates = bufferedCandidates
  bufferedCandidates = []
  for (const candidate of candidates) await pc.addIceCandidate(candidate).catch(() => undefined)
}

function endCall(message: string | null): void {
  teardown()
  if (message) useCallStore.getState().setError(message)
}

/** Stop every track, close the connection, null it out. A stale `pc` throws on a late candidate. */
export function teardown(): void {
  settingUp = false
  stopStream(localStream)
  stopStream(remoteStream)
  localStream = null
  remoteStream = null
  bufferedCandidates = []

  if (pc) {
    pc.onicecandidate = null
    pc.ontrack = null
    pc.onconnectionstatechange = null
    pc.close()
    pc = null
  }

  useCallStore.getState().reset()
  useCallStore.getState().bumpMedia()
}
