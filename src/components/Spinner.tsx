import { useT } from '@/lib/i18n'

export interface SpinnerProps {
  className?: string
  label?: string
}

export function Spinner({ className = 'size-4', label }: SpinnerProps) {
  const t = useT()
  return (
    <span
      role="status"
      aria-label={label ?? t.common.loading}
      className={`inline-block animate-spin rounded-full border-2 border-border-subtle border-t-accent ${className}`}
    />
  )
}
