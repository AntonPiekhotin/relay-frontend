/**
 * Time formatting. Payload timestamps are ISO strings; the envelope `ts` is epoch millis. Parse at
 * the boundary, keep `Date`/number in the domain, format here (docs/UI.md §5).
 */

import type { Iso } from './protocol/types'

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function toDate(iso: Iso): Date {
  return new Date(iso)
}

/** Epoch millis for sorting. An unparseable value sorts oldest rather than poisoning the sort. */
export function toMillis(iso: Iso): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

/** `HH:mm` — what a message row shows. */
export function formatTime(iso: Iso): string {
  return time.format(toDate(iso))
}

/** The day separator label inside a conversation. */
export function formatDaySeparator(iso: Iso): string {
  const date = toDate(iso)
  const days = daysAgo(date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekday.format(date)
  return date.getFullYear() === new Date().getFullYear() ? dayMonth.format(date) : dayMonthYear.format(date)
}

/**
 * The dialog list's relative stamp. `null` means nobody has ever written here — render nothing,
 * never an epoch date, and remember those dialogs sort last.
 */
export function formatDialogTime(iso: Iso | null): string {
  if (!iso) return ''
  const date = toDate(iso)
  const days = daysAgo(date)
  if (days === 0) return time.format(date)
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekday.format(date)
  return date.getFullYear() === new Date().getFullYear() ? dayMonth.format(date) : dayMonthYear.format(date)
}

/** "Last seen" text. A null `last_seen` is UNKNOWN, not long ago — the caller renders bare "Offline". */
export function formatLastSeen(iso: Iso | null): string | null {
  if (!iso) return null
  const date = toDate(iso)
  const days = daysAgo(date)
  if (days === 0) return `last seen at ${time.format(date)}`
  if (days === 1) return 'last seen yesterday'
  return `last seen ${dayMonth.format(date)}`
}

export function isSameDay(a: Iso, b: Iso): boolean {
  const left = toDate(a)
  const right = toDate(b)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function daysAgo(date: Date): number {
  const diff = startOfDay(new Date()) - startOfDay(date)
  return Math.round(diff / 86_400_000)
}
