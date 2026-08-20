/** `/api/v1/user/**` — profiles, search, contacts, avatars (docs/REST-API.md §3). */

import { api, apiRaw } from './client'
import type {
  AvatarUploadResponse,
  Contact,
  MyProfile,
  PagedResponse,
  PublicUser,
  SearchHit,
  UpdateProfileRequest,
} from './types'

/** Every "my" endpoint resolves the subject from the JWT, never from the path. */
export function getMe(): Promise<MyProfile> {
  return api<MyProfile>('/user/me')
}

/** A genuine PUT: both fields are required and replace the pair wholesale. Refetch before editing. */
export function updateMe(body: UpdateProfileRequest): Promise<MyProfile> {
  return api<MyProfile>('/user/me', { method: 'PUT', body })
}

export function getUser(id: string): Promise<PublicUser> {
  return api<PublicUser>(`/user/${id}`)
}

/**
 * Names match by prefix, email only exactly, and you are excluded from your own results.
 * A term shorter than two characters is a 400 — gate client-side rather than issuing it.
 */
export function searchUsers(query: string, page = 0, size = 20): Promise<PagedResponse<SearchHit>> {
  return api<PagedResponse<SearchHit>>('/user/search', { query: { query, page, size } })
}

export function getContacts(page = 0, size = 20): Promise<PagedResponse<Contact>> {
  return api<PagedResponse<Contact>>('/user/me/contacts', { query: { page, size } })
}

/** Idempotent: re-adding answers 200 instead of 201. Both are success. */
export function addContact(userId: string): Promise<void> {
  return api<void>('/user/me/contacts', { method: 'POST', body: { userId } })
}

/** Idempotent: removing somebody you never had is still a 204. */
export function removeContact(userId: string): Promise<void> {
  return api<void>(`/user/me/contacts/${userId}`, { method: 'DELETE' })
}

/** Multipart with a part named `file`, max 1 MB. The server sniffs the type from the bytes. */
export function uploadAvatar(file: File): Promise<AvatarUploadResponse> {
  const form = new FormData()
  form.append('file', file)
  return api<AvatarUploadResponse>('/user/me/avatar', { method: 'POST', body: form })
}

export function deleteAvatar(): Promise<void> {
  return api<void>('/user/me/avatar', { method: 'DELETE' })
}

/**
 * The avatar bytes. This goes through the authenticated fetch on purpose: the endpoint sits behind
 * `anyRequest().authenticated()` and a browser attaches no bearer token to an `<img src>`, so a raw
 * src is a 401 and a broken image (docs/REST-API.md §3).
 */
export function fetchAvatarBlob(avatarPath: string): Promise<Response> {
  return apiRaw(avatarPath)
}
