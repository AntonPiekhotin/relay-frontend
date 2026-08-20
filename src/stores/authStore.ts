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

/** Refresh at this fraction of the access token's lifetime. */
const PROACTIVE_REFRESH_RATIO = 0.8
/** Never schedule a refresh closer than this — a pathologically short token would spin. */
const MIN_REFRESH_DELAY_MS = 5_000

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

/**
 * `localStorage` is synchronous, so persisted state has already been read back by the time this
 * module finishes evaluating. The flag exists so the route guard does not bounce a reloading user
 * to /login before their tokens are visible.
 *
 * This runs here rather than in `onRehydrateStorage`, whose callback fires during `create()` —
 * while the `useAuthStore` binding is still in its temporal dead zone.
 */
useAuthStore.setState({ hydrated: true })
if (useAuthStore.getState().refreshToken) scheduleProactiveRefresh()

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

/**
 * Refresh the access token. Every concurrent caller awaits the same promise — this is the
 * single-flight guarantee the whole 401 path depends on.
 */
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
    // Only the server SAYING no ends the session. A 502 from the proxy while the backend restarts,
    // or a network failure, must leave the tokens alone — otherwise a restart signs everybody out.
    .catch((error: unknown): RefreshOutcome =>
      error instanceof ApiError && error.isClient ? 'invalid' : 'unreachable',
    )
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

/** The boolean the REST client's 401 path wants: only a fresh token lets it retry. */
export function refreshSession(): Promise<boolean> {
  return refreshSessionDetailed().then((outcome) => outcome === 'ok')
}

/** Best-effort server-side logout, then local teardown. Never blocks the UI on the network. */
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

configureApiAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: refreshSession,
  logout: () => useAuthStore.getState().signOut(),
})
