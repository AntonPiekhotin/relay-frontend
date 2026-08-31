import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { useThemeStore } from '@/stores/themeStore'
import { useT } from '@/lib/i18n'

export interface ThemeToggleProps {
  className?: string
}

/**
 * The quick switch: one press, opposite theme. It deliberately does not cycle through `system` —
 * a three-state icon button gives no clue which state it is in, and the sun/moon pair reads as
 * "what you will get", not "what you have". `system` lives in the labelled control on the profile
 * screen, where it can say the word.
 *
 * Pressing it is an explicit choice, so it also ends the OS following that `system` sets up.
 */
export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const t = useT()
  const resolved = useThemeStore((s) => s.resolved)
  const toggle = useThemeStore((s) => s.toggle)
  const next = resolved === 'dark' ? 'light' : 'dark'
  const label = t.theme.switchTo(next)

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={`shrink-0 ${className}`}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </Button>
  )
}
