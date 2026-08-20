import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addMembers, deleteDialog, leaveDialog, removeMember, renameGroup } from '@/lib/api/dialogs'
import { friendlyError } from '@/lib/api/errors'
import { qk } from '@/queries/keys'
import { dropDialog } from '@/queries/historyCache'
import { useDialog } from '@/queries/useDialogs'
import { displayName, initialsOf, useUser } from '@/queries/useUser'
import { useAuthStore } from '@/stores/authStore'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { ErrorState } from '@/components/ErrorState'
import { Spinner } from '@/components/Spinner'
import { MemberPicker } from './MemberPicker'
import type { PublicUser } from '@/lib/api/types'

const MAX_MEMBERS_INCLUDING_ME = 50

export function GroupInfoPage() {
  const { dialogId } = useParams<{ dialogId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const myId = useAuthStore((s) => s.userId)
  const dialog = useDialog(dialogId)
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState<PublicUser[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (dialog.data?.title) setTitle(dialog.data.title)
  }, [dialog.data?.title])

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.dialog(dialogId ?? '') })
    void qc.invalidateQueries({ queryKey: qk.dialogs })
  }

  const rename = useMutation({
    mutationFn: () => renameGroup(dialogId as string, title.trim()),
    onSuccess: refresh,
  })
  const add = useMutation({
    mutationFn: () => addMembers(dialogId as string, { userIds: adding.map((u) => u.id) }),
    onSuccess: () => {
      setAdding([])
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(dialogId as string, userId),
    onSuccess: refresh,
  })
  const leave = useMutation({
    mutationFn: () => leaveDialog(dialogId as string),
    onSuccess: () => {
      if (dialogId) dropDialog(qc, dialogId)
      navigate('/', { replace: true })
    },
  })
  const destroy = useMutation({
    mutationFn: () => deleteDialog(dialogId as string),
    onSuccess: () => {
      if (dialogId) dropDialog(qc, dialogId)
      navigate('/', { replace: true })
    },
  })

  if (!dialogId) return null
  if (dialog.isPending) return <Spinner className="m-6 size-6" />
  if (dialog.isError) {
    return <ErrorState error={dialog.error} what="This conversation is no longer available." />
  }
  if (dialog.data.type !== 'group') {
    return <ErrorState error={null} what="This is not a group conversation." />
  }

  /**
   * `ownerId` is null on legacy admin-less groups. Hide the management controls in that case
   * rather than offering buttons whose calls can only fail (docs/REST-API.md §2).
   */
  const isOwner = dialog.data.ownerId !== null && dialog.data.ownerId === myId
  const hasOwner = dialog.data.ownerId !== null
  const remainingSlots = MAX_MEMBERS_INCLUDING_ME - dialog.data.participantIds.length - adding.length

  return (
    <div className="mx-auto w-full max-w-lg space-y-8 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{dialog.data.title ?? 'Group'}</h1>
        <Link to={`/d/${dialogId}`} className="text-sm text-accent hover:underline">
          Back to chat
        </Link>
      </div>

      {isOwner ? (
        <section className="space-y-3">
          <Input label="Group name" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button size="sm" disabled={!title.trim() || rename.isPending} onClick={() => rename.mutate()}>
            Rename
          </Button>
          {rename.isError ? <p className="text-sm text-red-400">{friendlyError(rename.error)}</p> : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Members ({dialog.data.participantIds.length} of {MAX_MEMBERS_INCLUDING_ME})
        </h2>
        <ul className="space-y-1">
          {dialog.data.participantIds.map((id) => (
            <MemberRow
              key={id}
              userId={id}
              isOwner={dialog.data.ownerId === id}
              canRemove={isOwner && id !== myId}
              onRemove={() => remove.mutate(id)}
            />
          ))}
        </ul>
        {remove.isError ? <p className="text-sm text-red-400">{friendlyError(remove.error)}</p> : null}
      </section>

      {isOwner ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add members</h2>
          <MemberPicker
            selected={adding}
            onChange={setAdding}
            excludeIds={dialog.data.participantIds}
            remainingSlots={remainingSlots}
          />
          <Button size="sm" disabled={adding.length === 0 || add.isPending} onClick={() => add.mutate()}>
            Add {adding.length > 0 ? adding.length : ''}
          </Button>
          {/* Adding somebody who is already in is a silent no-op server-side, not an error. */}
          {add.isError ? <p className="text-sm text-red-400">{friendlyError(add.error)}</p> : null}
        </section>
      ) : null}

      <section className="flex gap-2">
        {/* The owner cannot leave — a 422. They delete the group or keep it. */}
        {hasOwner && !isOwner ? (
          <Button variant="secondary" onClick={() => leave.mutate()} disabled={leave.isPending}>
            Leave group
          </Button>
        ) : null}
        {isOwner ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete group
          </Button>
        ) : null}
      </section>

      <Modal
        open={confirmDelete}
        title="Delete this group?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={destroy.isPending} onClick={() => destroy.mutate()}>
              Delete
            </Button>
          </>
        }
      >
        The conversation, its membership and every message in it are deleted for everyone. This
        cannot be undone.
      </Modal>
    </div>
  )
}

interface MemberRowProps {
  userId: string
  isOwner: boolean
  canRemove: boolean
  onRemove: () => void
}

function MemberRow({ userId, isOwner, canRemove, onRemove }: MemberRowProps) {
  const user = useUser(userId)
  return (
    <li className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-raised">
      <Avatar avatarUrl={user.data?.avatarUrl} userId={userId} initials={initialsOf(user.data)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{user.data ? displayName(user.data) : 'Loading…'}</p>
        {isOwner ? <p className="text-xs text-zinc-500">Owner</p> : null}
      </div>
      {canRemove ? (
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      ) : null}
    </li>
  )
}
