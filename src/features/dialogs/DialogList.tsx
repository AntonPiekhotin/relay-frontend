import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDialogs } from '@/queries/useDialogs'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/Input'
import { SkeletonRows } from '@/components/SkeletonRows'
import { DialogListItem } from './DialogListItem'
import { useDialogNames } from './useDialogDisplay'

export function DialogList() {
  const dialogs = useDialogs()
  const [term, setTerm] = useState('')
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

  const items = dialogs.data ?? []
  const names = useDialogNames(items)

  // A filter over what is loaded, not a server query — there is no dialog-search endpoint, and the
  // list is keyset-paginated in pages of 100, so the sentinel below keeps widening what it can see.
  const query = term.trim().toLowerCase()
  const visible = query ? items.filter((d) => (names.get(d.dialogId) ?? '').toLowerCase().includes(query)) : items

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 border-b border-border-subtle p-2">
        <Icon
          name="search"
          className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
        <Input
          type="search"
          aria-label="Search conversations"
          placeholder="Search conversations"
          className="pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {dialogs.isPending ? (
        <SkeletonRows />
      ) : dialogs.isError ? (
        <ErrorState
          error={dialogs.error}
          what="Could not load your conversations."
          onRetry={() => void dialogs.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          hint="Find someone in Contacts to start a conversation."
          action={
            <Link
              to="/contacts"
              className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm hover:bg-surface-hover"
            >
              Open contacts
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" hint="Nothing here is named like that. Try fewer letters." />
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {visible.map((dialog) => (
            <DialogListItem key={dialog.dialogId} dialog={dialog} />
          ))}
          <div ref={sentinel} className="h-px" />
        </ul>
      )}
    </div>
  )
}
