/** `/api/v1/message/**` — dialogs, membership, read state (docs/REST-API.md §2). */

import { api } from './client'
import type {
  AddMembersRequest,
  CreateGroupDialogRequest,
  DialogListResponse,
  DialogSummary,
  OpenDialogResponse,
  ReadStateResponse,
} from './types'

/** Keyset pagination: `cursor` is a dialogId from the previous page and is exclusive. */
export function getDialogs(cursor?: string | null, limit = 100): Promise<DialogListResponse> {
  return api<DialogListResponse>('/message/dialogs', { query: { cursor, limit } })
}

/** A dialog you are not in answers 404, never 403 — see the 404-not-403 rule. */
export function getDialog(dialogId: string): Promise<DialogSummary> {
  return api<DialogSummary>(`/message/dialogs/${dialogId}`)
}

/**
 * THE entry point for a direct conversation — a client has no other way to obtain a dialog id.
 * Idempotent by the pair, so never check whether one exists first: this call IS the check.
 * 201 opened it, 200 it already existed; both are success and the body is identical.
 */
export function openDirectDialog(peerId: string): Promise<OpenDialogResponse> {
  return api<OpenDialogResponse>('/message/dialogs', { method: 'POST', body: { peerId } })
}

/** `dialogId` is client-generated and IS the idempotency key — a retry returns the same group. */
export function createGroupDialog(body: CreateGroupDialogRequest): Promise<DialogSummary> {
  return api<DialogSummary>('/message/dialogs/group', { method: 'POST', body })
}

export function renameGroup(dialogId: string, title: string): Promise<void> {
  return api<void>(`/message/dialogs/${dialogId}/title`, { method: 'PUT', body: { title } })
}

/** Adding an existing member is a silent no-op. Exceeding the cap of 50 is a 409. */
export function addMembers(dialogId: string, body: AddMembersRequest): Promise<void> {
  return api<void>(`/message/dialogs/${dialogId}/members`, { method: 'POST', body })
}

export function removeMember(dialogId: string, userId: string): Promise<void> {
  return api<void>(`/message/dialogs/${dialogId}/members/${userId}`, { method: 'DELETE' })
}

/** Any member but the owner. The owner gets a 422 — they delete the group or keep it. */
export function leaveDialog(dialogId: string): Promise<void> {
  return api<void>(`/message/dialogs/${dialogId}/leave`, { method: 'POST' })
}

export function deleteDialog(dialogId: string): Promise<void> {
  return api<void>(`/message/dialogs/${dialogId}`, { method: 'DELETE' })
}

/** The seen-by snapshot. A member who has never read is ABSENT, not present with nulls. */
export function getReadState(dialogId: string): Promise<ReadStateResponse> {
  return api<ReadStateResponse>(`/message/dialogs/${dialogId}/read-state`)
}
