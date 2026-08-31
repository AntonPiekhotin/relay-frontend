/**
 * Where a component gets its strings. `useT()` subscribes to the language store, so switching the
 * language re-renders everything that shows text; `translate()` is the snapshot for code that runs
 * outside React (the call engine, the socket dispatcher), which composes a string at event time.
 *
 * There are no string keys and no lookup at runtime — `t.chat.send` is a property access, a typo is
 * a compile error, and each language's plural rules live inside its own catalog.
 */

import { useLanguageStore, type Language } from '@/stores/languageStore'
import { en, type Messages } from './en'
import { uk } from './uk'

export type { Messages }

const CATALOGS: Record<Language, Messages> = { en, uk }

/** A language names itself in itself — the one string that must never be translated. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  uk: 'Українська',
}

/** The current catalog, as a React subscription. */
export function useT(): Messages {
  return CATALOGS[useLanguageStore((s) => s.resolved)]
}

/**
 * The current catalog, as a plain read. For non-component code; a string built with this is a
 * snapshot and will not re-translate if the language changes after the fact — which is right for
 * an event ("Call declined.") and wrong for a label, so labels go through `useT()`.
 */
export function translate(): Messages {
  return CATALOGS[useLanguageStore.getState().resolved]
}
