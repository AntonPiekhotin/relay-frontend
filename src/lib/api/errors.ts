/**
 * Human-facing text for a failed request.
 *
 * The server's `errorMessage` array is never rendered raw (docs/UI.md §4) — it is developer text,
 * it sometimes ships alongside a `stackTrace`, and matching on it is forbidden anyway. Map the
 * status, which is the only part of the error shape that is a contract.
 *
 * These read the current language at call time. A component that renders one re-renders on a
 * language change (it holds the error and also calls `useT()`), so the text follows the switch.
 */

import { ApiError } from './client'
import { translate } from '@/lib/i18n'

export function friendlyError(error: unknown, fallback?: string): string {
  const t = translate()
  const generic = fallback ?? t.errors.generic
  if (!(error instanceof ApiError)) {
    return navigator.onLine ? generic : t.errors.offline
  }
  switch (error.status) {
    case 400:
      return t.errors.badRequest
    case 401:
      return t.errors.sessionExpired
    case 403:
      return t.errors.forbidden
    case 404:
      return t.errors.gone
    case 409:
      return t.errors.conflict
    case 413:
      return t.errors.fileTooLarge
    case 415:
      return t.errors.unsupportedFileType
    case 422:
      return t.errors.notAllowed
    case 429:
      return t.errors.tooManyRequests
    default:
      return error.status >= 500 ? t.errors.serverTrouble : generic
  }
}

/** Sign-in and registration deserve their own wording — a 401 there is bad credentials, not expiry. */
export function friendlyAuthError(error: unknown): string {
  const t = translate()
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 400) return t.errors.badCredentials
    if (error.status === 409) return t.errors.emailTaken
  }
  return friendlyError(error, t.errors.signInFailed)
}
