export interface SkeletonRowsProps {
  count?: number
}

/** Skeleton rows, not a centred spinner — a spinner replacing a whole pane reflows twice. */
export function SkeletonRows({ count = 6 }: SkeletonRowsProps) {
  return (
    <div className="space-y-1 p-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg p-2">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface-raised" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-raised" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-raised" />
          </div>
        </div>
      ))}
    </div>
  )
}
