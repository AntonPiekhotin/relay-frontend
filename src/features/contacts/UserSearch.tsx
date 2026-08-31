import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addContact, removeContact, searchUsers } from '@/lib/api/users'
import { openDirectDialog } from '@/lib/api/dialogs'
import { qk } from '@/queries/keys'
import { displayName, initialsOf } from '@/queries/useUser'
import { useDebounced } from '@/hooks/useDebounced'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Spinner } from '@/components/Spinner'
import type { SearchHit } from '@/lib/api/types'
import { useT } from '@/lib/i18n'

/** Shorter than this is a 400 — gate it here rather than asking the server to reject it. */
const MIN_QUERY_LENGTH = 2

export function UserSearch() {
  const t = useT()
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term.trim(), 300)
  const enabled = debounced.length >= MIN_QUERY_LENGTH

  const results = useQuery({
    queryKey: qk.search(debounced, 0),
    queryFn: () => searchUsers(debounced, 0, 20),
    enabled,
  })

  return (
    <section className="space-y-3">
      <Input
        label={t.contacts.findPeople}
        placeholder={t.contacts.searchPlaceholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {/* Names match by prefix, email only exactly — a prefix match on email would harvest addresses. */}
      {!enabled ? (
        <p className="text-xs text-fg-subtle">{t.contacts.typeMore}</p>
      ) : results.isPending ? (
        <div className="flex justify-center p-4">
          <Spinner />
        </div>
      ) : results.isError ? (
        <ErrorState error={results.error} what={t.contacts.searchFailed} onRetry={() => void results.refetch()} />
      ) : results.data.items.length === 0 ? (
        <EmptyState title={t.contacts.nobodyTitle} hint={t.contacts.nobodyHint} />
      ) : (
        <ul className="space-y-1">
          {results.data.items.map((hit) => (
            <PersonRow key={hit.user.id} hit={hit} />
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonRow({ hit }: { hit: SearchHit }) {
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const contact = useMutation({
    mutationFn: () => (hit.contact ? removeContact(hit.user.id) : addContact(hit.user.id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] })
      void qc.invalidateQueries({ queryKey: ['search'] })
    },
  })

  const open = useMutation({
    // This call IS the existence check — idempotent by the pair, 201 and 200 both success.
    mutationFn: () => openDirectDialog(hit.user.id),
    onSuccess: (dialog) => {
      void qc.invalidateQueries({ queryKey: qk.dialogs })
      navigate(`/d/${dialog.id}`)
    },
  })

  return (
    <li className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-raised">
      <Avatar avatarUrl={hit.user.avatarUrl} userId={hit.user.id} initials={initialsOf(hit.user)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{displayName(hit.user)}</p>
        <p className="truncate text-xs text-fg-subtle">{hit.user.email}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => contact.mutate()} disabled={contact.isPending}>
        {hit.contact ? t.common.remove : t.common.add}
      </Button>
      <Button size="sm" onClick={() => open.mutate()} disabled={open.isPending}>
        {t.common.message}
      </Button>
    </li>
  )
}
