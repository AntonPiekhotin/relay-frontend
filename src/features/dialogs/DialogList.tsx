import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useDialogs } from '@/queries/useDialogs'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SkeletonRows } from '@/components/SkeletonRows'
import { DialogListItem } from './DialogListItem'

export function DialogList() {
  const dialogs = useDialogs()
  const sentinel = useRef<HTMLDivElement | null>(null)

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = dialogs
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (dialogs.isPending) return <SkeletonRows />
  if (dialogs.isError) {
    return <ErrorState error={dialogs.error} what="Could not load your conversations." onRetry={() => void dialogs.refetch()} />
  }

  const items = dialogs.data ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Conversations
      </h2>

      {items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          hint="Find someone in Contacts to start a conversation."
          action={
            <Link
              to="/contacts"
              className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm hover:brightness-125"
            >
              Open contacts
            </Link>
          }
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((dialog) => (
            <DialogListItem key={dialog.dialogId} dialog={dialog} />
          ))}
          <div ref={sentinel} className="h-px" />
        </ul>
      )}
    </div>
  )
}
