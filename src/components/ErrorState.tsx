import { Button } from './Button'
import { friendlyError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n'

export interface ErrorStateProps {
  error: unknown
  /** What was being attempted, in the user's terms. */
  what?: string
  onRetry?: () => void
}

/** Never renders `errorMessage[]` raw and never a `stackTrace` (docs/UI.md §4). */
export function ErrorState({ error, what, onRetry }: ErrorStateProps) {
  const t = useT()
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg-muted">{what ?? t.common.couldNotLoad}</p>
        <p className="text-sm text-fg-subtle">{friendlyError(error)}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t.common.tryAgain}
        </Button>
      ) : null}
    </div>
  )
}
