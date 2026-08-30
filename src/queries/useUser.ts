/**
 * Profile lookups. A `direct` dialog has no title — it is named by resolving the peer through
 * `GET /user/{id}` — so these run constantly and are cached hard by id (docs/MESSAGING.md §7).
 */

import { useQuery } from '@tanstack/react-query'
import { getMe, getUser } from '@/lib/api/users'
import { qk } from './keys'
import type { MyProfile, PublicUser } from '@/lib/api/types'

/** Profiles change rarely; a stale name is a far smaller problem than 50 refetches per render. */
const PROFILE_STALE_MS = 5 * 60 * 1000

export function useMe() {
  return useQuery<MyProfile>({
    queryKey: qk.me,
    queryFn: getMe,
    staleTime: PROFILE_STALE_MS,
  })
}

/**
 * The one description of a profile query, so the several places that need one — `useUser` for a row,
 * `useQueries` for a whole list at once — observe the very same cache entry rather than two keys
 * that merely look alike.
 */
export function userQueryOptions(id: string) {
  return {
    queryKey: qk.user(id),
    queryFn: () => getUser(id),
    staleTime: PROFILE_STALE_MS,
  }
}

export function useUser(id: string | null | undefined) {
  return useQuery<PublicUser>({
    ...userQueryOptions(id ?? ''),
    enabled: Boolean(id),
  })
}

export function displayName(user: Pick<PublicUser, 'firstName' | 'lastName'> | undefined): string {
  if (!user) return ''
  return `${user.firstName} ${user.lastName}`.trim()
}

export function initialsOf(user: Pick<PublicUser, 'firstName' | 'lastName'> | undefined): string {
  if (!user) return '?'
  const first = user.firstName.trim()[0] ?? ''
  const last = user.lastName.trim()[0] ?? ''
  return (first + last).toUpperCase() || '?'
}
