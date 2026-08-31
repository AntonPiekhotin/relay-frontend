/**
 * The UI language: a device preference, like the theme and for the same reasons — the server has no
 * notion of it and should not be asked. It persists as a bare string under `relay.language`
 * (docs/ARCHITECTURE.md §4's device-preference exception, alongside `relay.theme`).
 *
 * `system` is a live preference, not a one-time read: the browser fires `languagechange` when the
 * OS or browser language list changes, and a client left on the old language would be the same
 * unexplainable bug as a stale theme.
 *
 * This store knows nothing about what the strings say — the catalogs live in `lib/i18n/`, the way
 * the colour values live in `index.css` rather than in `themeStore`.
 */

import { create } from 'zustand'

/** A language the app actually ships strings for. Adding one starts in `lib/i18n/`. */
export type Language = 'en' | 'uk'
export type LanguagePreference = Language | 'system'

const STORAGE_KEY = 'relay.language'
const LANGUAGES: readonly Language[] = ['en', 'uk']

interface LanguageState {
  preference: LanguagePreference
  resolved: Language
  setPreference: (preference: LanguagePreference) => void
}

function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value)
}

function isPreference(value: unknown): value is LanguagePreference {
  return value === 'system' || isLanguage(value)
}

function readStored(): LanguagePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    // Private mode, or a browser with storage blocked. A language is not worth a crash.
    return 'system'
  }
}

/**
 * The browser's language list, most preferred first. `uk-UA` counts as `uk` — match on the primary
 * subtag, and take the first entry we have a catalog for. English is the fallback, not a match:
 * a Polish browser gets English, never Ukrainian by adjacency.
 */
function systemLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of candidates) {
    const primary = tag?.toLowerCase().split('-')[0]
    if (isLanguage(primary)) return primary
  }
  return 'en'
}

export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'system' ? systemLanguage() : preference
}

/** The single writer of `<html lang>` — screen readers and hyphenation key off it. */
function applyLanguage(resolved: Language): void {
  document.documentElement.lang = resolved
}

const initialPreference = readStored()

export const useLanguageStore = create<LanguageState>()((set) => ({
  preference: initialPreference,
  resolved: resolveLanguage(initialPreference),

  setPreference: (preference) => {
    const resolved = resolveLanguage(preference)
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Unwritable storage costs us persistence across reloads, not this session's language.
    }
    applyLanguage(resolved)
    set({ preference, resolved })
  },
}))

/**
 * Called once from `main.tsx`: stamps `<html lang>` (index.html ships `lang="en"` for the first
 * paint) and starts following the browser for as long as the preference is `system`.
 */
export function initLanguage(): void {
  applyLanguage(useLanguageStore.getState().resolved)

  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  window.addEventListener('languagechange', () => {
    if (useLanguageStore.getState().preference !== 'system') return
    const resolved = systemLanguage()
    applyLanguage(resolved)
    useLanguageStore.setState({ resolved })
  })
}
