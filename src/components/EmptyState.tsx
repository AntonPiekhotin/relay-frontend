import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  /** Say what to do next — an empty state that only says "nothing here" wastes the moment. */
  hint?: string
  action?: ReactNode
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {hint ? <p className="max-w-xs text-sm text-zinc-500">{hint}</p> : null}
      {action}
    </div>
  )
}
