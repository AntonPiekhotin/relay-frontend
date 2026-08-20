/**
 * Human-facing text for a failed request.
 *
 * The server's `errorMessage` array is never rendered raw (docs/UI.md §4) — it is developer text,
 * it sometimes ships alongside a `stackTrace`, and matching on it is forbidden anyway. Map the
 * status, which is the only part of the error shape that is a contract.
 */

import { ApiError } from './client'

export function friendlyError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!(error instanceof ApiError)) {
    return navigator.onLine ? fallback : 'You appear to be offline.'
  }
  switch (error.status) {
    case 400:
      return 'That request was not valid.'
    case 401:
      return 'Your session has expired. Sign in again.'
    case 403:
      return 'You do not have access to do that.'
    case 404:
      return 'That is no longer available.'
    case 409:
      return 'That conflicts with something that already exists.'
    case 413:
      return 'That file is too large.'
    case 415:
      return 'That file type is not supported.'
    case 422:
      return 'That action is not allowed here.'
    case 429:
      return 'Too many requests. Wait a moment.'
    default:
      return error.status >= 500 ? 'The server is having trouble. Try again shortly.' : fallback
  }
}

/** Sign-in and registration deserve their own wording — a 401 there is bad credentials, not expiry. */
export function friendlyAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 400) return 'Those credentials were not accepted.'
    if (error.status === 409) return 'An account with that email already exists.'
  }
  return friendlyError(error, 'Could not sign you in. Try again.')
}
