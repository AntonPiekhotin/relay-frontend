/**
 * The REST contract. Transcribed from the backend's docs/PROTOCOL.md §5 and verified against the
 * Kotlin DTOs (DialogDtos.kt, MessageDtos.kt, auth/dto).
 *
 * REST bodies are camelCase. WebSocket payloads are snake_case. Same field, two spellings:
 * `dialogId` over HTTP, `dialog_id` on the socket. Do not "normalise" one into the other in a
 * shared type — the split is deliberate and permanent.
 *
 * Every response type below must tolerate unknown fields: some error bodies carry a `stackTrace`
 * array that a strict parser would choke on. Never validate a response with a closed schema.
 */

import type { Iso } from '../protocol/types'

// ─── Auth ────────────────────────────────────────────────────────────────────

/** The one endpoint group with snake_case keys — it is Keycloak's token response, passed through. */
export interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_expires_in: number
  refresh_token: string
  token_type: string
  scope: string
}

export interface RegisterRequest {
  email: string
  password: string
  firstName: string
  lastName: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

// ─── Users and contacts ──────────────────────────────────────────────────────

/** The public subset. What `GET /user/{id}` and every search hit return. */
export interface PublicUser {
  id: string
  email: string
  firstName: string
  lastName: string
  /** Relative on purpose — resolve against the API base. Carries a `?v=` cache stamp. */
  avatarUrl: string | null
}

/** `GET /user/me` only — adds the private fields. */
export interface MyProfile extends PublicUser {
  createdAt: Iso
  updatedAt: Iso
}

export interface UpdateProfileRequest {
  /** A genuine PUT: both required, and they replace the pair wholesale. */
  firstName: string
  lastName: string
}

export interface SearchHit {
  user: PublicUser
  /** The JSON key is `contact`, NOT `isContact`. */
  contact: boolean
}

export interface Contact {
  user: PublicUser
  addedAt: Iso
}

/** Offset paging — the exception, used only by search and contacts. Page with `hasNext`. */
export interface PagedResponse<T> {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

export interface AvatarUploadResponse {
  avatarUrl: string
  contentType: string
  sizeBytes: number
  updatedAt: Iso
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

export type DialogType = 'direct' | 'group'

/** From the dialog list and `GET /dialogs/{id}`. Note the id key is `dialogId` here. */
export interface DialogSummary {
  dialogId: string
  type: DialogType
  participantIds: string[]
  /** Null for a dialog nobody has written in yet — those sort LAST. Never ≠ long ago. */
  lastMessageAt: Iso | null
  /** Relative to the caller. Your own messages never count. */
  unreadCount: number
  createdAt: Iso
  /** Null on a `direct` dialog — name it by subtracting yourself from participantIds. */
  title: string | null
  /** The single admin. Null on `direct` and on legacy admin-less groups. */
  ownerId: string | null
}

export interface DialogListResponse {
  dialogs: DialogSummary[]
  /** Pass back as `cursor`. Null on the last page. */
  nextCursor: string | null
}

/** `POST /dialogs` answers with `id`, not `dialogId`. Same value, two names (§5.1). */
export interface OpenDialogResponse {
  id: string
  type: DialogType
  participantIds: string[]
  createdAt: Iso
}

export interface OpenDirectDialogRequest {
  peerId: string
}

export interface CreateGroupDialogRequest {
  /** Client-generated UUID v4 — this IS the idempotency key. */
  dialogId: string
  title: string
  memberIds: string[]
}

export interface RenameGroupRequest {
  title: string
}

export interface AddMembersRequest {
  userIds: string[]
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryMessage {
  messageId: string
  dialogId: string
  /** On a system row this is the actor. */
  senderId: string
  /** Empty on system rows except `group_renamed`, which carries the new title. */
  text: string
  createdAt: Iso
  /** Present ONLY on your own messages. Absent on other people's and on system rows. */
  clientMsgId?: string
  /** `user`, or a system kind. Tolerate unknown values. */
  kind: string
  targetUserId: string | null
}

export interface MessageHistoryResponse {
  messages: HistoryMessage[]
  nextCursor: string | null
}

export interface ReadStateEntry {
  userId: string
  lastReadMessageId: string
  lastReadAt: Iso
}

/** A member who has never read is ABSENT, not present-with-nulls. */
export interface ReadStateResponse {
  entries: ReadStateEntry[]
}

// ─── Calls ───────────────────────────────────────────────────────────────────

export interface IceServersResponse {
  /** Hand to `RTCPeerConnection` unchanged. */
  iceServers: RTCIceServer[]
  /** Credentials are minted per request and expire. Refetch before this elapses. */
  ttlSeconds: number
}

export interface CallLogEntry {
  id: string
  dialogId: string | null
  kind: 'direct' | 'group'
  /** Relative to the caller of this endpoint. */
  direction: 'incoming' | 'outgoing'
  /** On a group entry this is the initiator — null when YOU are the initiator. */
  peerId: string | null
  participantCount: number
  media: 'audio' | 'video'
  status: 'ringing' | 'answered' | 'rejected' | 'missed' | 'ended'
  startedAt: Iso
  answeredAt: Iso | null
  endedAt: Iso | null
  /** Talk time, not ring time. Absent/null for a call never answered. */
  durationSeconds: number | null
  endReason: string | null
}

export interface CallLogResponse {
  calls: CallLogEntry[]
  nextCursor: string | null
}

export interface GroupCallParticipant {
  userId: string
  state: 'invited' | 'joined' | 'declined' | 'missed' | 'left'
}

/** Present only where the caller is admitted to the room: create and join. */
export interface LiveKitGrant {
  url: string
  token: string
  expiresAt: Iso
}

export interface GroupCallResponse {
  callId: string
  kind: 'group'
  media: 'audio' | 'video'
  status: string
  initiator: string
  startedAt: Iso
  /** The honest deadline. Do not run a shorter timer of your own. */
  ringExpiresAt: Iso
  answeredAt: Iso | null
  endedAt: Iso | null
  endReason: string | null
  durationSeconds: number | null
  participants: GroupCallParticipant[]
  livekit: LiveKitGrant | null
}

export interface CreateGroupCallRequest {
  /** Client-generated UUID v4. A retried create with the same id is the same call. */
  callId: string
  media: 'audio' | 'video'
  inviteeIds: string[]
  /** From `session.connected`. Only excludes the acting device from its own `cancel`. */
  sessionId?: string
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * The REST error shape — NOT the `code`/`message` shape of the frames. Match on HTTP status,
 * never on message text. `errorMessage` is always an array; validation failures put one entry
 * per rejected field, formatted `field: reason`.
 */
export interface RestErrorBody {
  time: string
  statusCode: number
  errorMessage: string[]
  /** Present sometimes. Ignore it and never show it. */
  stackTrace?: string[]
}

// ─── Device tokens ───────────────────────────────────────────────────────────

export interface RegisterDeviceTokenRequest {
  deviceId: string
  token: string
  platform: string
}
