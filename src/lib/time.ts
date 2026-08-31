/**
 * Time formatting. Payload timestamps are ISO strings; the envelope `ts` is epoch millis. Parse at
 * the boundary, keep `Date`/number in the domain, format here (docs/UI.md §5).
 *
 * Formatters follow the app language, not the browser locale — a UI in Ukrainian with English
 * month names is half-translated. They are built lazily per language and cached: an
 * `Intl.DateTimeFormat` is expensive to construct and every message row calls these. These read the
 * language at call time, so a caller that should live-switch must itself re-render on a language
 * change — every component that formats a time also calls `useT()`, which does exactly that.
 */

import type { Iso } from './protocol/types'
import { useLanguageStore, type Language } from '@/stores/languageStore'
import { translate } from './i18n'

interface Formatters {
  time: Intl.DateTimeFormat
  weekday: Intl.DateTimeFormat
  dayMonth: Intl.DateTimeFormat
  dayMonthYear: Intl.DateTimeFormat
}

const byLanguage = new Map<Language, Formatters>()

function formatters(): Formatters {
  const language = useLanguageStore.getState().resolved
  let cached = byLanguage.get(language)
  if (!cached) {
    cached = {
      time: new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }),
      weekday: new Intl.DateTimeFormat(language, { weekday: 'long' }),
      dayMonth: new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }),
      dayMonthYear: new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }),
    }
    byLanguage.set(language, cached)
  }
  return cached
}

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
  return formatters().time.format(toDate(iso))
}

/** The day separator label inside a conversation. */
export function formatDaySeparator(iso: Iso): string {
  const t = translate()
  const date = toDate(iso)
  const days = daysAgo(date)
  if (days === 0) return t.time.today
  if (days === 1) return t.time.yesterday
  const f = formatters()
  if (days < 7) return f.weekday.format(date)
  return date.getFullYear() === new Date().getFullYear() ? f.dayMonth.format(date) : f.dayMonthYear.format(date)
}

/**
 * The dialog list's relative stamp. `null` means nobody has ever written here — render nothing,
 * never an epoch date, and remember those dialogs sort last.
 */
export function formatDialogTime(iso: Iso | null): string {
  if (!iso) return ''
  const date = toDate(iso)
  const days = daysAgo(date)
  const f = formatters()
  if (days === 0) return f.time.format(date)
  if (days === 1) return translate().time.yesterday
  if (days < 7) return f.weekday.format(date)
  return date.getFullYear() === new Date().getFullYear() ? f.dayMonth.format(date) : f.dayMonthYear.format(date)
}

/** "Last seen" text. A null `last_seen` is UNKNOWN, not long ago — the caller renders bare "Offline". */
export function formatLastSeen(iso: Iso | null): string | null {
  if (!iso) return null
  const t = translate()
  const date = toDate(iso)
  const days = daysAgo(date)
  if (days === 0) return t.time.lastSeenAt(formatters().time.format(date))
  if (days === 1) return t.time.lastSeenYesterday
  return t.time.lastSeenOn(formatters().dayMonth.format(date))
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
