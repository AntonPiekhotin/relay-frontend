import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LanguagePreference } from './languageStore'

/**
 * The store reads `localStorage` and `navigator.languages` at module scope — the preference has to
 * be known before the first render — so each test needs a fresh module, like `themeStore.test.ts`.
 */
async function loadStore(options?: { stored?: LanguagePreference; browser?: string[] }) {
  vi.resetModules()
  localStorage.clear()
  if (options?.stored) localStorage.setItem('relay.language', options.stored)
  if (options?.browser) {
    Object.defineProperty(window.navigator, 'languages', {
      value: options.browser,
      configurable: true,
    })
    Object.defineProperty(window.navigator, 'language', {
      value: options.browser[0] ?? 'en-US',
      configurable: true,
    })
  }
  document.documentElement.lang = 'en'
  return import('./languageStore')
}

function fireLanguageChange(browser: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: browser, configurable: true })
  window.dispatchEvent(new Event('languagechange'))
}

describe('languageStore', () => {
  /**
   * `initLanguage` installs a window listener it never removes (the store lives as long as the
   * app). Tests share one jsdom window across module resets, so collect and detach them — or a
   * previous test's store instance answers the next test's `languagechange`.
   */
  const installed: EventListenerOrEventListenerObject[] = []
  const realAddEventListener = window.addEventListener.bind(window)

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true })
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'languagechange' && listener) installed.push(listener)
      realAddEventListener(type, listener, options)
    })
  })
  afterEach(() => {
    for (const listener of installed.splice(0)) window.removeEventListener('languagechange', listener)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('defaults to system, resolved from the browser language list', async () => {
    const { useLanguageStore } = await loadStore({ browser: ['uk-UA', 'en-US'] })
    expect(useLanguageStore.getState().preference).toBe('system')
    expect(useLanguageStore.getState().resolved).toBe('uk')
  })

  it('matches on the primary subtag, taking the first supported entry', async () => {
    const { useLanguageStore } = await loadStore({ browser: ['pl-PL', 'uk'] })
    expect(useLanguageStore.getState().resolved).toBe('uk')
  })

  it('falls back to English when nothing in the list is supported', async () => {
    const { useLanguageStore } = await loadStore({ browser: ['pl-PL', 'de-DE'] })
    expect(useLanguageStore.getState().resolved).toBe('en')
  })

  it('honours a stored explicit preference over the browser', async () => {
    const { useLanguageStore } = await loadStore({ stored: 'uk', browser: ['en-US'] })
    expect(useLanguageStore.getState().preference).toBe('uk')
    expect(useLanguageStore.getState().resolved).toBe('uk')
  })

  it('treats an unknown stored value as system rather than crashing', async () => {
    localStorage.setItem('relay.language', 'klingon')
    vi.resetModules()
    const { useLanguageStore } = await import('./languageStore')
    expect(useLanguageStore.getState().preference).toBe('system')
  })

  it('persists a chosen preference and stamps <html lang>', async () => {
    const { useLanguageStore, initLanguage } = await loadStore({ browser: ['en-US'] })
    initLanguage()
    useLanguageStore.getState().setPreference('uk')
    expect(localStorage.getItem('relay.language')).toBe('uk')
    expect(document.documentElement.lang).toBe('uk')
  })

  it('follows a browser language change while the preference is system', async () => {
    const { useLanguageStore, initLanguage } = await loadStore({ browser: ['en-US'] })
    initLanguage()
    expect(useLanguageStore.getState().resolved).toBe('en')

    fireLanguageChange(['uk-UA'])
    expect(useLanguageStore.getState().resolved).toBe('uk')
    expect(document.documentElement.lang).toBe('uk')
  })

  it('stops following the browser once a language is chosen explicitly', async () => {
    const { useLanguageStore, initLanguage } = await loadStore({ browser: ['en-US'] })
    initLanguage()
    useLanguageStore.getState().setPreference('en')

    fireLanguageChange(['uk-UA'])
    expect(useLanguageStore.getState().resolved).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
