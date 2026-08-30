import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getContacts, removeContact } from '@/lib/api/users'
import { openDirectDialog } from '@/lib/api/dialogs'
import { qk } from '@/queries/keys'
import { displayName, initialsOf } from '@/queries/useUser'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SkeletonRows } from '@/components/SkeletonRows'

/**
 * Contacts are the one offset-paginated surface, and they page by `hasNext` — never by comparing
 * `page` against `totalPages` (docs/REST-API.md §3). Do not copy this shape onto messages.
 */
export function ContactList() {
  const [page, setPage] = useState(0)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const contacts = useQuery({
    queryKey: qk.contacts(page),
    queryFn: () => getContacts(page, 20),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removeContact(userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts'] }),
  })

  const open = useMutation({
    mutationFn: (peerId: string) => openDirectDialog(peerId),
    onSuccess: (dialog) => {
      void qc.invalidateQueries({ queryKey: qk.dialogs })
      navigate(`/d/${dialog.id}`)
    },
  })

  if (contacts.isPending) return <SkeletonRows count={4} />
  if (contacts.isError) {
    return <ErrorState error={contacts.error} what="Could not load your contacts." onRetry={() => void contacts.refetch()} />
  }
  if (contacts.data.items.length === 0) {
    return <EmptyState title="No contacts yet" hint="Search above to find people and add them." />
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Contacts</h2>
      <ul className="space-y-1">
        {contacts.data.items.map(({ user }) => (
          <li key={user.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-raised">
            <Avatar avatarUrl={user.avatarUrl} userId={user.id} initials={initialsOf(user)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{displayName(user)}</p>
              <p className="truncate text-xs text-fg-subtle">{user.email}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => remove.mutate(user.id)}>
              Remove
            </Button>
            <Button size="sm" onClick={() => open.mutate(user.id)}>
              Message
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className="text-xs text-fg-subtle">Page {page + 1}</span>
        <Button variant="ghost" size="sm" disabled={!contacts.data.hasNext} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </section>
  )
}
