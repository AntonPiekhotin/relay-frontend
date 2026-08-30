/**
 * The colour theme: a device preference, not account state.
 *
 * It is the third thing in this app that survives a reload, and the one exception to
 * docs/ARCHITECTURE.md §4's "persist exactly two stores" — the rule exists to keep server-derived
 * and ephemeral state out of `localStorage`, and a theme is neither. It is written as a bare string
 * under `relay.theme` rather than through zustand's `persist` middleware, because the inline script
 * in `index.html` has to read the same value before React exists: parsing the middleware's
 * `{state:{…}}` envelope in a script tag would couple that script to zustand's storage format.
 *
 * `system` is a live preference, not a one-time read — the OS can flip at sunset while the tab is
 * open, and a client left on last night's palette is a bug the user cannot explain.
 */

import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'
/** What is actually painted. `system` resolves to one of these; the DOM only ever sees these two. */
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'relay.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Flip to the opposite of what is on screen — the quick toggle, which never lands on `system`. */
  toggle: () => void
}

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStored(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    // Private mode, or a browser with storage blocked. A theme is not worth a crash.
    return 'system'
  }
}

/** jsdom has no `matchMedia`, and neither does a non-browser runtime. Light is the safe answer. */
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

/**
 * The single writer of the `.dark` class. Tokens in `index.css` hang off it, so this one line is
 * what repaints the app; `color-scheme` comes along with it and fixes the native scrollbars,
 * caret, and form controls that Tailwind never touches.
 */
function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

const initialPreference = readStored()

export const useThemeStore = create<ThemeState>()((set, get) => ({
  preference: initialPreference,
  resolved: resolveTheme(initialPreference),

  setPreference: (preference) => {
    const resolved = resolveTheme(preference)
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Unwritable storage costs us persistence across reloads, not this session's theme.
    }
    applyTheme(resolved)
    set({ preference, resolved })
  },

  toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
}))

/**
 * Called once from `main.tsx`. The inline script in `index.html` has already painted the right
 * theme; this re-applies it (the script and the store read the same key, so they agree) and starts
 * following the OS for as long as the preference is `system`.
 */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().resolved)

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', () => {
    if (useThemeStore.getState().preference !== 'system') return
    const resolved: ResolvedTheme = media.matches ? 'dark' : 'light'
    applyTheme(resolved)
    useThemeStore.setState({ resolved })
  })
}
