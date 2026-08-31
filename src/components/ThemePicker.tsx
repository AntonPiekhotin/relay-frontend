import { useThemeStore, type ThemePreference } from '@/stores/themeStore'
import { useT } from '@/lib/i18n'

/**
 * The full choice, including `system` — which is a standing instruction to follow the OS, not a
 * third colour, so it needs a word rather than an icon.
 *
 * A radio group rather than three buttons: exactly one is chosen, arrow keys move between them,
 * and a screen reader announces "2 of 3" without any aria bookkeeping of ours.
 */
export function ThemePicker() {
  const t = useT()
  const preference = useThemeStore((s) => s.preference)
  const setPreference = useThemeStore((s) => s.setPreference)

  const options: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t.theme.system },
    { value: 'light', label: t.theme.light },
    { value: 'dark', label: t.theme.dark },
  ]

  return (
    <div role="radiogroup" aria-label={t.theme.label} className="inline-flex gap-1 rounded-lg border border-border-subtle p-1">
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
