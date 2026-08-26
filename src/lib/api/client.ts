/**
 * The fetch wrapper.
 *
 * `VITE_API_BASE` is read here and nowhere else (docs/ARCHITECTURE.md §6). It is a PATH — the
 * backend has no CORS configuration, so a cross-origin fetch never reaches Spring (§2).
 *
 * Auth is injected rather than imported: the app entry calls `initAuth()`, which calls
 * `configureApiAuth` — that keeps this module free of any store import and the graph acyclic.
 * Until then `getAccessToken` is unset and requests go out unauthenticated.
 */

import type { RestErrorBody } from './types'

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

export interface ApiAuthAdapter {
  getAccessToken(): string | null
  /** Single in-flight refresh, shared by every concurrent 401. Resolves false when it failed. */
  refresh(): Promise<boolean>
  logout(): void
}

let auth: ApiAuthAdapter | null = null

export function configureApiAuth(adapter: ApiAuthAdapter): void {
  auth = adapter
}

/**
 * A REST failure. Match on `status`, never on the message text (docs/REST-API.md §0).
 * `messages` is the server's `errorMessage` array; it is never rendered raw, and `stackTrace` is
 * dropped on the floor here so no caller can leak it.
 */
export class ApiError extends Error {
  readonly status: number
  readonly messages: string[]

  constructor(status: number, messages: string[]) {
    super(messages[0] ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.messages = messages
  }

  /** True for the statuses where retrying the same request cannot help. */
  get isClient(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

export interface RequestOptions {
  method?: string | undefined
  /** Serialised as JSON unless it is a `FormData`, which is passed through with no content type. */
  body?: unknown
  signal?: AbortSignal | undefined
  headers?: Record<string, string> | undefined
  query?: Record<string, string | number | boolean | null | undefined> | undefined
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = resolveApiUrl(path)
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function buildInit(opts: RequestOptions, token: string | null): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  if (token) headers.Authorization = `Bearer ${token}`

  const init: RequestInit = { method: opts.method ?? 'GET', headers }
  if (opts.signal) init.signal = opts.signal

  if (opts.body instanceof FormData) {
    // Never set Content-Type by hand for multipart — the boundary comes from the browser.
    init.body = opts.body
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  return init
}

async function toApiError(res: Response): Promise<ApiError> {
  let messages: string[] = []
  try {
    const body = (await res.json()) as Partial<RestErrorBody>
    if (Array.isArray(body.errorMessage)) messages = body.errorMessage.filter((m) => typeof m === 'string')
  } catch {
    // A non-JSON body (a proxy error page, an empty 502) is not exceptional here.
  }
  return new ApiError(res.status, messages)
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/** Unauthenticated request. Used by the `/auth/**` routes, which are the only ones without a token. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, opts.query), buildInit(opts, null))
  if (!res.ok) throw await toApiError(res)
  return parse<T>(res)
}

/**
 * Authenticated request.
 *
 * 401 → one refresh, one retry, then log out. Never loops: the retry is issued with `retried` set,
 * so a second 401 falls straight through to logout. Concurrent 401s all await the same refresh
 * promise held by the auth store, so five parallel requests burn one refresh token, not five.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const send = (): Promise<Response> =>
    fetch(buildUrl(path, opts.query), buildInit(opts, auth?.getAccessToken() ?? null))

  let res = await send()

  if (res.status === 401 && auth) {
    const refreshed = await auth.refresh()
    if (!refreshed) {
      auth.logout()
      throw await toApiError(res)
    }
    res = await send()
    if (res.status === 401) {
      auth.logout()
      throw await toApiError(res)
    }
  }

  if (!res.ok) throw await toApiError(res)
  return parse<T>(res)
}

/** Authenticated fetch returning the raw `Response` — for avatar blobs. */
export async function apiRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  const send = (): Promise<Response> =>
    fetch(buildUrl(path, opts.query), buildInit(opts, auth?.getAccessToken() ?? null))

  let res = await send()
  if (res.status === 401 && auth) {
    const refreshed = await auth.refresh()
    if (!refreshed) {
      auth.logout()
      throw await toApiError(res)
    }
    res = await send()
  }
  if (!res.ok) throw await toApiError(res)
  return res
}

/**
 * Resolve a path against the API base.
 *
 * Endpoint functions pass a bare path (`/user/me`). Server-supplied values do not: an `avatarUrl`
 * comes back as `/api/v1/user/{id}/avatar?v=…` — relative on purpose, because the host depends on
 * which edge you came through — and prefixing that again yields `/api/v1/api/v1/…` and a 404 that
 * the avatar cache swallows into permanent initials. So a path that already carries the base is
 * left alone (docs/REST-API.md §3).
 */
export function resolveApiUrl(path: string): string {
  if (path.startsWith(`${API_BASE}/`) || path === API_BASE) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
