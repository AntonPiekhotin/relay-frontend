/**
 * Tokens and the current user id. One of exactly two persisted stores (docs/ARCHITECTURE.md §4).
 *
 * `localStorage` is the accepted trade for this project — readable by any XSS. The decision lives
 * here alone so it can be changed in one place (docs/REST-API.md §1).
 *
 * Two things this store owns that are easy to get wrong:
 *  - ONE in-flight refresh, shared by every concurrent 401, or five parallel requests burn five
 *    refresh tokens and race each other into a logout.
 *  - A PROACTIVE refresh at ~80% of `expires_in`, because a WebSocket handshake that fails
 *    authentication does not say why — it just fails.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError, configureApiAuth } from '@/lib/api/client'
import * as authApi from '@/lib/api/auth'
import type { TokenResponse } from '@/lib/api/types'

const PROACTIVE_REFRESH_RATIO = 0.8
const MIN_REFRESH_DELAY_MS = 5_000
const REFRESH_RETRY_DELAY_MS = 30_000

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  /** Epoch millis at which the access token expires. */
  expiresAt: number | null
  /** The application user id from `/user/me` — NOT the JWT `sub`, which is a Keycloak id. */
  userId: string | null
  /** False until the persisted state has been read back, so the guard does not bounce on reload. */
  hydrated: boolean

  setSession: (tokens: TokenResponse) => void
  setUserId: (id: string) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      userId: null,
      hydrated: false,

      setSession: (tokens) => {
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        })
        scheduleProactiveRefresh()
      },

      setUserId: (id) => set({ userId: id }),

      signOut: () => {
        clearRefreshTimer()
        set({ accessToken: null, refreshToken: null, expiresAt: null, userId: null })
      },
    }),
    {
      name: 'relay.auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        expiresAt: s.expiresAt,
        userId: s.userId,
      }),
    },
  ),
)

// ─── Refresh ─────────────────────────────────────────────────────────────────

/**
 * Why an outcome rather than a boolean: a failed refresh means two very different things. A
 * rejected refresh token is the end of the session; an unreachable server is a blip that must not
 * sign anybody out — the socket in particular has to keep retrying through a backend restart.
 */
export type RefreshOutcome = 'ok' | 'invalid' | 'unreachable'

let refreshInFlight: Promise<RefreshOutcome> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function clearRefreshTimer(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleProactiveRefresh(): void {
  clearRefreshTimer()
  const { expiresAt, refreshToken } = useAuthStore.getState()
  if (!expiresAt || !refreshToken) return

  const lifetime = expiresAt - Date.now()
  const delay = Math.max(lifetime * PROACTIVE_REFRESH_RATIO, MIN_REFRESH_DELAY_MS)
  refreshTimer = setTimeout(() => {
    void refreshSession()
  }, delay)
}

function scheduleRefreshRetry(): void {
  clearRefreshTimer()
  if (!useAuthStore.getState().refreshToken) return

  refreshTimer = setTimeout(() => {
    void refreshSession()
  }, REFRESH_RETRY_DELAY_MS)
}

export function refreshSessionDetailed(): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight

  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) return Promise.resolve<RefreshOutcome>('invalid')

  refreshInFlight = authApi
    .refreshTokens(refreshToken)
    .then((tokens): RefreshOutcome => {
      useAuthStore.getState().setSession(tokens)
      return 'ok'
    })
    .catch((error: unknown): RefreshOutcome =>
      error instanceof ApiError && error.isClient ? 'invalid' : 'unreachable',
    )
    .then((outcome): RefreshOutcome => {
      if (outcome === 'unreachable') scheduleRefreshRetry()
      return outcome
    })
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

export function refreshSession(): Promise<boolean> {
  return refreshSessionDetailed().then((outcome) => outcome === 'ok')
}

export function signOut(): void {
  const { refreshToken } = useAuthStore.getState()
  if (refreshToken) void authApi.logout(refreshToken).catch(() => undefined)
  useAuthStore.getState().signOut()
}

/** Non-React read of the current user id, for the frame dispatcher and other plain modules. */
export function currentUserId(): string | null {
  return useAuthStore.getState().userId
}

export function currentAccessToken(): string | null {
  return useAuthStore.getState().accessToken
}

export function initAuth(): void {
  configureApiAuth({
    getAccessToken: () => useAuthStore.getState().accessToken,
    refresh: refreshSession,
    logout: () => useAuthStore.getState().signOut(),
  })

  useAuthStore.setState({ hydrated: true })
  if (useAuthStore.getState().refreshToken) scheduleProactiveRefresh()
}
