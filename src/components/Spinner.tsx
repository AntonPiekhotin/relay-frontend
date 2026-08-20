export interface SpinnerProps {
  className?: string
  label?: string
}

export function Spinner({ className = 'size-4', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block animate-spin rounded-full border-2 border-zinc-600 border-t-accent ${className}`}
    />
  )
}
