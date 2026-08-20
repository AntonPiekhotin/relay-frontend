/**
 * The WebSocket wire contract. Transcribed from the backend's docs/PROTOCOL.md §3-§4.
 *
 * TWO RULES THAT ARE EASY TO GET WRONG:
 *  1. Envelope keys are flat lowercase (`v`, `type`, `id`, `ts`); every key inside `payload` is
 *     snake_case. The backend uses a separate Jackson mapper for the wire precisely so this
 *     cannot be broken by an internal refactor. REST bodies are camelCase — see lib/api/types.ts.
 *  2. `ts` is epoch millis as a number. Payload timestamps (`created_at`, `read_at`, `last_seen`)
 *     are ISO-8601 strings. They are not interchangeable.
 *
 * Server-to-client envelopes carry NO `id`. Correlation runs through payload fields:
 * `client_msg_id` on an ack, `ref_id` on an error or pong.
 *
 * Do not add a frame type here before it exists in the backend's docs/PROTOCOL.md.
 */

export const PROTOCOL_VERSION = 1

/** Epoch millis. */
export type Millis = number
/** ISO-8601 instant, e.g. "2026-07-26T10:00:00Z". */
export type Iso = string

// ─── Envelope ────────────────────────────────────────────────────────────────

export interface OutboundEnvelope<T = unknown> {
  v: typeof PROTOCOL_VERSION
  type: OutboundFrameType
  /** Client-generated UUID v4. Mandatory on every C→S frame. */
  id: string
  ts: Millis
  payload: T
}

export interface InboundEnvelope<T = unknown> {
  v: number
  /** Unknown types MUST be ignored silently, never treated as an error (§3). */
  type: string
  ts: Millis
  payload: T
}

// ─── C→S ─────────────────────────────────────────────────────────────────────

export type OutboundFrameType =
  | 'message.send'
  | 'message.read'
  | 'presence.subscribe'
  | 'presence.unsubscribe'
  | 'typing.start'
  | 'call.invite'
  | 'call.accept'
  | 'call.reject'
  | 'call.ice'
  | 'call.hangup'
  | 'ping'

/** The envelope `id` IS the client_msg_id. Generate once, reuse for every retry (§6). */
export interface MessageSendPayload {
  dialog_id: string
  text: string
}

/** A position, not a message: one frame names the newest read message, never fifty frames. */
export interface MessageReadOutPayload {
  dialog_id: string
  up_to_message_id: string
}

export interface DialogRefPayload {
  dialog_id: string
}

export interface CallInvitePayload {
  call_id: string
  callee_id: string
  media: CallMedia
  sdp: string
  dialog_id?: string
}

export interface CallAcceptPayload {
  call_id: string
  sdp: string
}

export interface CallRejectPayload {
  call_id: string
  reason?: string
}

export interface CallIcePayload {
  call_id: string
  /** Opaque RTCIceCandidateInit. The server never parses it. */
  candidate: RTCIceCandidateInit
}

export interface CallHangupPayload {
  call_id: string
  reason?: string
}

// ─── S→C ─────────────────────────────────────────────────────────────────────

/** The first frame on every accepted socket, sent unprompted. */
export interface SessionConnectedPayload {
  user_id: string
  /** Identifies THIS connection, not this user. Phone and web have two. */
  session_id: string
}

export interface AckPayload {
  client_msg_id: string
  message_id: string
  /** Authoritative. May differ from the local optimistic value and reorder the message. */
  created_at: Iso
}

export interface MessageNewPayload {
  message_id: string
  dialog_id: string
  sender_id: string
  text: string
  created_at: Iso
}

export interface MessageReadInPayload {
  dialog_id: string
  /** Whose cursor moved. When this is YOU, another device read — clear the unread badge. */
  user_id: string
  up_to_message_id: string
  /** The `created_at` of the message at the cursor, not the time of the read. */
  read_at: Iso
}

export type SystemMessageKind =
  | 'group_created'
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'group_renamed'

/** Structured, never rendered server-side. Resolve names client-side; tolerate unknown kinds. */
export interface MessageSystemPayload {
  message_id: string
  dialog_id: string
  actor_id: string
  kind: SystemMessageKind | string
  target_user_id: string | null
  /** The dialog's CURRENT title — already the new one on `group_renamed`. */
  title: string | null
  created_at: Iso
}

export interface DialogDeletedPayload {
  dialog_id: string
  actor_id: string
}

export type PresenceStatus = 'online' | 'offline'

export interface PresenceUpdatePayload {
  user_id: string
  /** Treat an unrecognised value as `offline` rather than failing. */
  status: PresenceStatus | string
  /** Null whenever unknown — every `online` update, and after a server restart. Not an error. */
  last_seen: Iso | null
}

export interface TypingStartInPayload {
  dialog_id: string
  user_id: string
}

export interface ErrorPayload {
  /** A plain string, not an enum. Clients MUST tolerate an unknown code (§8). */
  code: ErrorCode | string
  message: string
  /** Echoes the `id` of the offending frame. Null when the envelope id was unreadable. */
  ref_id: string | null
}

export interface PongPayload {
  ref_id: string
}

export type ErrorCode =
  | 'BAD_FRAME'
  | 'UNSUPPORTED_VERSION'
  | 'SEND_FAILED'
  | 'CALL_SIGNAL_FAILED'
  | 'DIALOG_NOT_FOUND'
  | 'NOT_A_PARTICIPANT'
  | 'INVALID_REQUEST'
  | 'INTERNAL'
  | 'USER_BUSY'
  | 'CALL_NOT_FOUND'
  | 'INVALID_CALL_STATE'

/** §8: everything else is permanent. Nothing about a call is ever retryable. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'SEND_FAILED',
  'INTERNAL',
])

// ─── Calls: one opaque outbound frame, verb inside ───────────────────────────

export type CallMedia = 'audio' | 'video'

export interface CallSignalPayload {
  call_id: string
  from_user_id: string
  /** An unrecognised verb ignores one signal instead of failing to route a frame. */
  signal: CallSignal
}

export type CallSignal =
  | { verb: 'invite'; media: CallMedia; sdp: string; dialog_id: string | null; started_at: Iso; ring_expires_at: Iso }
  | { verb: 'accept'; sdp: string }
  | { verb: 'reject'; reason: string | null }
  | { verb: 'ice'; candidate: RTCIceCandidateInit }
  | { verb: 'hangup'; reason: string | null; duration_s: number | null }
  /** Another of YOUR devices settled it — stop ringing. The device that acted gets nothing. */
  | { verb: 'cancel'; reason: string | null }
  | { verb: 'missed'; reason: string | null }
  | { verb: 'state'; status: string }
  | { verb: 'group_invite'; kind: 'group'; media: CallMedia; started_at: Iso; ring_expires_at: Iso; participants: GroupCallParticipantWire[] }
  | { verb: 'participant_joined'; user_id: string }
  | { verb: 'participant_left'; user_id: string; reason: string | null }
  | { verb: 'participant_declined'; user_id: string; reason: string | null }
  | { verb: 'participant_missed'; user_id: string }
  | { verb: 'group_ended'; reason: GroupEndReason | string; duration_s: number | null }
  | { verb: string; [key: string]: unknown }

export type GroupEndReason = 'caller_canceled' | 'all_declined' | 'all_left' | 'ring_timeout'

export interface GroupCallParticipantWire {
  user_id: string
  state: GroupCallParticipantState
}

export type GroupCallParticipantState = 'invited' | 'joined' | 'declined' | 'missed' | 'left'
