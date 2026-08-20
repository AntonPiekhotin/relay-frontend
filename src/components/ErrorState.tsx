import { Button } from './Button'
import { friendlyError } from '@/lib/api/errors'

export interface ErrorStateProps {
  error: unknown
  /** What was being attempted, in the user's terms. */
  what?: string
  onRetry?: () => void
}

/** Never renders `errorMessage[]` raw and never a `stackTrace` (docs/UI.md §4). */
export function ErrorState({ error, what = 'Could not load this.', onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-300">{what}</p>
        <p className="text-sm text-zinc-500">{friendlyError(error)}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
