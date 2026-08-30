import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchUsers } from '@/lib/api/users'
import { qk } from '@/queries/keys'
import { displayName, initialsOf } from '@/queries/useUser'
import { useDebounced } from '@/hooks/useDebounced'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import type { PublicUser } from '@/lib/api/types'

export interface MemberPickerProps {
  selected: PublicUser[]
  onChange: (users: PublicUser[]) => void
  /** Ids already in the group — they are shown as unavailable rather than silently no-oping. */
  excludeIds?: string[]
  /** How many more may be added before the 50-member cap (including the caller) is reached. */
  remainingSlots: number
}

const MIN_QUERY_LENGTH = 2

/**
 * Member ids are NOT validated against user-service — a garbage id yields a member who never
 * connects. So members are always picked from search results, never typed (docs/REST-API.md §2).
 */
export function MemberPicker({ selected, onChange, excludeIds = [], remainingSlots }: MemberPickerProps) {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term.trim(), 300)
  const enabled = debounced.length >= MIN_QUERY_LENGTH

  const results = useQuery({
    queryKey: qk.search(debounced, 0),
    queryFn: () => searchUsers(debounced, 0, 20),
    enabled,
  })

  const isSelected = (id: string) => selected.some((user) => user.id === id)
  const toggle = (user: PublicUser) => {
    if (isSelected(user.id)) onChange(selected.filter((u) => u.id !== user.id))
    else if (remainingSlots > 0) onChange([...selected, user])
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => toggle(user)}
                className="flex items-center gap-2 rounded-full bg-surface-raised py-1 pl-1 pr-3 text-sm hover:bg-surface-hover"
                aria-label={`Remove ${displayName(user)}`}
              >
                <Avatar avatarUrl={user.avatarUrl} userId={user.id} initials={initialsOf(user)} size="sm" />
                {displayName(user)}
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Input
        label="Add people"
        placeholder="Name, or an exact email"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      {!enabled ? (
        <p className="text-xs text-fg-subtle">Type at least two characters.</p>
      ) : results.isPending ? (
        <Spinner />
      ) : results.isError ? (
        <p className="text-xs text-danger">Search failed. Try again.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {results.data.items.map(({ user }) => {
            const already = excludeIds.includes(user.id)
            return (
              <li key={user.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-raised">
                <Avatar avatarUrl={user.avatarUrl} userId={user.id} initials={initialsOf(user)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{displayName(user)}</p>
                  <p className="truncate text-xs text-fg-subtle">{user.email}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={already || (!isSelected(user.id) && remainingSlots <= 0)}
                  onClick={() => toggle(user)}
                >
                  {already ? 'In group' : isSelected(user.id) ? 'Remove' : 'Add'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
