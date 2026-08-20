/** `/api/v1/call/**` (docs/REST-API.md §4, docs/CALLS.md). */

import { api } from './client'
import type {
  CallLogResponse,
  CreateGroupCallRequest,
  GroupCallResponse,
  IceServersResponse,
} from './types'

/**
 * For 1:1 calls ONLY. Credentials are minted per request and expire, so fetch fresh per call
 * rather than caching. Never fetch this for a group call — the LiveKit SDK negotiates its own
 * transport from the room token.
 */
export function getIceServers(): Promise<IceServersResponse> {
  return api<IceServersResponse>('/call/ice-servers')
}

export function getCallLog(before?: string | null, limit = 50): Promise<CallLogResponse> {
  return api<CallLogResponse>('/call/calls', { query: { before, limit } })
}

/** 201, or 200 when the same client-generated `callId` is retried. Both carry `livekit`. */
export function createGroupCall(body: CreateGroupCallRequest): Promise<GroupCallResponse> {
  return api<GroupCallResponse>('/call/group-calls', { method: 'POST', body })
}

/**
 * Join is also the token refresh: the LiveKit token is short-lived and checked only at connection
 * time, so a reconnect simply joins again. Legal from `invited`, `declined` and `left`.
 */
export function joinGroupCall(callId: string, sessionId?: string | null): Promise<GroupCallResponse> {
  return api<GroupCallResponse>(`/call/group-calls/${callId}/join`, {
    method: 'POST',
    body: sessionId ? { sessionId } : {},
  })
}

/** Only for a ringing invitee — a joined participant leaves instead. `livekit` is always null here. */
export function declineGroupCall(
  callId: string,
  reason?: string,
  sessionId?: string | null,
): Promise<GroupCallResponse> {
  return api<GroupCallResponse>(`/call/group-calls/${callId}/decline`, {
    method: 'POST',
    body: { ...(reason ? { reason } : {}), ...(sessionId ? { sessionId } : {}) },
  })
}

/** Idempotent — the SFU may have told the server first. */
export function leaveGroupCall(callId: string, sessionId?: string | null): Promise<GroupCallResponse> {
  return api<GroupCallResponse>(`/call/group-calls/${callId}/leave`, {
    method: 'POST',
    body: sessionId ? { sessionId } : {},
  })
}

/** 403 when you are not a participant — call ids are unguessable UUIDs, so that hides nothing. */
export function getGroupCall(callId: string): Promise<GroupCallResponse> {
  return api<GroupCallResponse>(`/call/group-calls/${callId}`)
}
