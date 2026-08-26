import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `initAuth()` is the boot path, and it is the path that broke: the hydration block used to run at
 * module scope, above the `let refreshTimer` declaration, so reading back a persisted session threw
 * a ReferenceError out of the temporal dead zone — a white screen on every reload for anybody
 * already signed in, and nothing before this exercised it.
 *
 * Each test imports the module fresh, because the state under test is the module's own.
 */
describe('authStore initialisation', () => {
  beforeEach(() => {
    vi.resetModules()
    // The refresh timer lives in module state that `vi.resetModules()` throws away, so a real timer
    // armed here could never be cleared again — it would outlive its test and fire against an
    // unmocked API. Fake timers are discarded wholesale in afterEach instead.
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('@/lib/api/auth')
  })

  it('reads back a persisted session without throwing during init', async () => {
    localStorage.setItem(
      'relay.auth',
      JSON.stringify({
        state: {
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 300_000,
          userId: 'u-1',
        },
        version: 0,
      }),
    )

    const { useAuthStore, currentUserId, initAuth } = await import('./authStore')
    initAuth()

    expect(useAuthStore.getState().hydrated).toBe(true)
    expect(useAuthStore.getState().accessToken).toBe('access')
    expect(currentUserId()).toBe('u-1')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('marks itself hydrated when there is nothing persisted, so the guard can decide', async () => {
    const { useAuthStore, initAuth } = await import('./authStore')
    initAuth()

    expect(useAuthStore.getState().hydrated).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('schedules the proactive refresh on a fresh sign-in', async () => {
    const { useAuthStore, initAuth } = await import('./authStore')
    initAuth()

    useAuthStore.getState().setSession({
      access_token: 'access',
      expires_in: 300,
      refresh_expires_in: 1800,
      refresh_token: 'refresh',
      token_type: 'Bearer',
      scope: '',
    })

    expect(useAuthStore.getState().accessToken).toBe('access')
    expect(useAuthStore.getState().expiresAt).toBeGreaterThan(Date.now())
    expect(vi.getTimerCount()).toBe(1)
  })
})

/**
 * A refresh that cannot reach the server must leave the tokens alone AND leave a timer behind. The
 * proactive refresh is otherwise one-shot: one blip during a backend restart and it is dead for the
 * rest of the session, which puts an idle user right back on an expired token.
 *
 * The persisted token has an hour left, so init's own proactive timer sits ~48 minutes out. Nothing
 * but a re-arm can fire inside the 30s these tests advance.
 */
describe('authStore refresh re-arming', () => {
  const RETRY_DELAY_MS = 30_000

  const persistSession = () =>
    localStorage.setItem(
      'relay.auth',
      JSON.stringify({
        state: {
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresAt: Date.now() + 3_600_000,
          userId: 'u-1',
        },
        version: 0,
      }),
    )

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('@/lib/api/auth')
  })

  it('retries on its own after a refresh that could not reach the server', async () => {
    vi.doMock('@/lib/api/auth', () => ({
      refreshTokens: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      logout: vi.fn().mockResolvedValue(undefined),
    }))
    persistSession()

    const authApi = await import('@/lib/api/auth')
    const { initAuth, refreshSessionDetailed } = await import('./authStore')
    initAuth()

    await expect(refreshSessionDetailed()).resolves.toBe('unreachable')
    expect(authApi.refreshTokens).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

    expect(authApi.refreshTokens).toHaveBeenCalledTimes(2)
  })

  it('gives up when the server rejects the refresh token', async () => {
    const { ApiError } = await import('@/lib/api/client')
    vi.doMock('@/lib/api/auth', () => ({
      refreshTokens: vi.fn().mockRejectedValue(new ApiError(401, [])),
      logout: vi.fn().mockResolvedValue(undefined),
    }))
    persistSession()

    const authApi = await import('@/lib/api/auth')
    const { initAuth, refreshSessionDetailed } = await import('./authStore')
    initAuth()

    await expect(refreshSessionDetailed()).resolves.toBe('invalid')

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)

    expect(authApi.refreshTokens).toHaveBeenCalledTimes(1)
  })
})
