/**
 * Authenticated avatar fetch with an object-URL cache.
 *
 * `GET /api/v1/user/{id}/avatar` is behind the gateway's `anyRequest().authenticated()`, and a
 * browser attaches no Authorization header to an `<img src>` — a raw src is a 401 and a broken
 * image. So: fetch the bytes with the token, hand an object URL to the `<img>`.
 *
 * Cached by `avatarUrl`, which carries a `?v=<millis>` stamp that changes whenever the picture
 * does — that is what makes caching by URL safe. Object URLs are revoked on eviction; they are a
 * real leak otherwise. See docs/REST-API.md §3.
 */

import { fetchAvatarBlob } from './api/users'

/** Enough for a long dialog list plus the open conversation, small enough to stay honest. */
const MAX_ENTRIES = 200

const urls = new Map<string, string>()
const inFlight = new Map<string, Promise<string | null>>()

export function getCachedAvatarUrl(avatarUrl: string): string | undefined {
  return urls.get(avatarUrl)
}

export function loadAvatar(avatarUrl: string): Promise<string | null> {
  const cached = urls.get(avatarUrl)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(avatarUrl)
  if (pending) return pending

  const promise = fetchAvatarBlob(avatarUrl)
    .then(async (res) => {
      const objectUrl = URL.createObjectURL(await res.blob())
      evictIfNeeded()
      urls.set(avatarUrl, objectUrl)
      return objectUrl
    })
    // A user with no picture answers 404 — the caller renders initials. Not an error worth raising.
    .catch(() => null)
    .finally(() => {
      inFlight.delete(avatarUrl)
    })

  inFlight.set(avatarUrl, promise)
  return promise
}

function evictIfNeeded(): void {
  while (urls.size >= MAX_ENTRIES) {
    const oldest = urls.keys().next()
    if (oldest.done) return
    const url = urls.get(oldest.value)
    if (url) URL.revokeObjectURL(url)
    urls.delete(oldest.value)
  }
}

/** Drop everything on sign-out — the URLs point at another account's bytes. */
export function clearAvatarCache(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
}
