import { useInfiniteQuery } from '@tanstack/react-query'
import { getCallLog } from '@/lib/api/calls'
import { qk } from '@/queries/keys'
import { displayName, useUser } from '@/queries/useUser'
import { formatDialogTime } from '@/lib/time'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SkeletonRows } from '@/components/SkeletonRows'
import type { CallLogEntry, CallLogResponse } from '@/lib/api/types'

/** Server-owned history, so it lives in the Query cache and not in `callStore`. */
export function CallLogPage() {
  const log = useInfiniteQuery<CallLogResponse, Error, CallLogEntry[], readonly string[], string | null>({
    queryKey: qk.callLog,
    initialPageParam: null,
    queryFn: ({ pageParam }) => getCallLog(pageParam, 50),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => data.pages.flatMap((page) => page.calls),
  })

  if (log.isPending) return <SkeletonRows count={5} />
  if (log.isError) return <ErrorState error={log.error} what="Could not load your calls." onRetry={() => void log.refetch()} />

  const calls = log.data ?? []

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Calls</h1>

      {calls.length === 0 ? (
        <EmptyState title="No calls yet" hint="Start one from the header of any conversation." />
      ) : (
        <ul className="space-y-1">
          {calls.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </ul>
      )}

      {log.hasNextPage ? (
        <Button variant="secondary" size="sm" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
          Load more
        </Button>
      ) : null}
    </div>
  )
}

function CallRow({ call }: { call: CallLogEntry }) {
  // On a group entry `peerId` is the initiator, and null when YOU are — so render the count instead.
  const peer = useUser(call.kind === 'direct' ? call.peerId : null)

  const who =
    call.kind === 'group'
      ? call.peerId
        ? `Group call · ${call.participantCount} people`
        : `Group call you started · ${call.participantCount} people`
      : peer.data
        ? displayName(peer.data)
        : 'Unknown'

  return (
    <li className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-raised">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{who}</p>
        <p className="text-xs text-zinc-500">
          {call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} · {call.media} · {call.status}
          {/* Talk time, not ring time — absent for a call that was never answered. */}
          {call.durationSeconds !== null ? ` · ${formatDuration(call.durationSeconds)}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-xs text-zinc-500">{formatDialogTime(call.startedAt)}</span>
    </li>
  )
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`
}
