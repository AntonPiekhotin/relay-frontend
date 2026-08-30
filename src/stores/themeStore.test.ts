import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedTheme, ThemePreference } from './themeStore'

/** Media-query listeners the store installed, so a test can fire an OS theme change at it. */
type MediaListener = () => void

function stubMatchMedia(matches: boolean): { flip: (next: boolean) => void } {
  const listeners = new Set<MediaListener>()
  const query = {
    matches,
    addEventListener: (_: string, fn: MediaListener) => void listeners.add(fn),
    removeEventListener: (_: string, fn: MediaListener) => void listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => query)
  Object.defineProperty(window, 'matchMedia', { value: () => query, configurable: true, writable: true })
  return {
    flip: (next) => {
      query.matches = next
      for (const fn of listeners) fn()
    },
  }
}

/**
 * The store reads `localStorage` and `matchMedia` at module scope — that is the point, the
 * preference has to be known before the first render — so each test needs a fresh module.
 */
async function loadStore(stored?: ThemePreference) {
  vi.resetModules()
  localStorage.clear()
  if (stored) localStorage.setItem('relay.theme', stored)
  document.documentElement.className = ''
  return import('./themeStore')
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('themeStore', () => {
  beforeEach(() => stubMatchMedia(false))
  afterEach(() => vi.unstubAllGlobals())

  it('follows the OS when nothing has been chosen', async () => {
    stubMatchMedia(true)
    const { useThemeStore, initTheme } = await loadStore()

    initTheme()

    expect(useThemeStore.getState().preference).toBe('system')
    expect(useThemeStore.getState().resolved).toBe<ResolvedTheme>('dark')
    expect(isDark()).toBe(true)
  })

  it('honours a stored choice over the OS preference', async () => {
    stubMatchMedia(true)
    const { useThemeStore, initTheme } = await loadStore('light')

    initTheme()

    expect(useThemeStore.getState().resolved).toBe<ResolvedTheme>('light')
    expect(isDark()).toBe(false)
  })

  it('persists a choice as a bare string, so the pre-paint script can read it', async () => {
    const { useThemeStore, initTheme } = await loadStore()
    initTheme()

    useThemeStore.getState().setPreference('dark')

    expect(localStorage.getItem('relay.theme')).toBe('dark')
    expect(isDark()).toBe(true)
  })

  it('toggles to the opposite of what is on screen, leaving `system` behind', async () => {
    stubMatchMedia(true)
    const { useThemeStore, initTheme } = await loadStore()
    initTheme()

    useThemeStore.getState().toggle()

    expect(useThemeStore.getState().preference).toBe<ThemePreference>('light')
    expect(isDark()).toBe(false)
  })

  it('keeps following the OS while the preference is `system`', async () => {
    const media = stubMatchMedia(false)
    const { useThemeStore, initTheme } = await loadStore()
    initTheme()

    media.flip(true)

    expect(useThemeStore.getState().resolved).toBe<ResolvedTheme>('dark')
    expect(isDark()).toBe(true)
  })

  it('ignores the OS once a theme has been chosen explicitly', async () => {
    const media = stubMatchMedia(false)
    const { useThemeStore, initTheme } = await loadStore()
    initTheme()
    useThemeStore.getState().setPreference('light')

    media.flip(true)

    expect(useThemeStore.getState().resolved).toBe<ResolvedTheme>('light')
    expect(isDark()).toBe(false)
  })

  it('falls back to light where there is no matchMedia at all', async () => {
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true })
    const { useThemeStore, initTheme } = await loadStore()

    expect(() => initTheme()).not.toThrow()
    expect(useThemeStore.getState().resolved).toBe<ResolvedTheme>('light')
  })
})
