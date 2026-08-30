import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={inputId} className="block text-xs font-medium text-fg-muted">
          {label}
        </label>
      ) : null}
      <input
        {...props}
        id={inputId}
        className={`h-10 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 text-base
          text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none sm:text-sm ${className}`}
      />
    </div>
  )
}
