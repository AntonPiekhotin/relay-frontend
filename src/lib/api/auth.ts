/**
 * `/api/v1/auth/**` — the only unauthenticated routes (docs/REST-API.md §1).
 *
 * These use `request`, not `api`: attaching a bearer token to a refresh would be pointless, and
 * routing them through the 401-refresh path would recurse.
 */

import { apiRaw, request } from './client'
import type {
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
} from './types'

/** Register answers with a token pair — it logs you in. There is no second step. */
export function register(body: RegisterRequest): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/register', { method: 'POST', body })
}

export function login(body: LoginRequest): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/login', { method: 'POST', body })
}

export function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return request<TokenResponse>('/auth/refresh', { method: 'POST', body: { refreshToken } })
}

export function logout(refreshToken: string): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST', body: { refreshToken } })
}

/**
 * Requires `currentPassword` even though the caller holds a valid token, and answers 204: existing
 * tokens stay valid, so there is nothing to hand back.
 *
 * A wrong `currentPassword` is a 401 — the one authenticated call where 401 is a verdict, not an
 * expired token. Through `api` that verdict would refresh, retry the same wrong password, and sign
 * the user out over a typo; `apiRaw` refreshes once and then hands the 401 back to the form.
 */
export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await apiRaw('/auth/password', { method: 'POST', body })
}
