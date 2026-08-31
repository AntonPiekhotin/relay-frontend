import { useLanguageStore, type LanguagePreference } from '@/stores/languageStore'
import { LANGUAGE_NAMES, useT } from '@/lib/i18n'

/**
 * The language control on the profile screen, shaped like `ThemePicker` and for the same reasons:
 * a radio group, with `system` as a word because it is a standing instruction to follow the
 * browser, not a third language.
 *
 * Only the `system` label is translated — each language names itself in itself, or a user stuck in
 * a language they cannot read has no word they recognise to get back out.
 */
export function LanguagePicker() {
  const t = useT()
  const preference = useLanguageStore((s) => s.preference)
  const setPreference = useLanguageStore((s) => s.setPreference)

  const options: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t.language.system },
    ...Object.entries(LANGUAGE_NAMES).map(([value, label]) => ({ value: value as LanguagePreference, label })),
  ]

  return (
    <div
      role="radiogroup"
      aria-label={t.language.label}
      className="inline-flex gap-1 rounded-lg border border-border-subtle p-1"
    >
      {options.map((option) => {
        const selected = preference === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected ? 'bg-surface-raised font-medium text-fg' : 'text-fg-muted hover:bg-surface-raised'
              }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
