import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createGroupDialog } from '@/lib/api/dialogs'
import { friendlyError } from '@/lib/api/errors'
import { qk } from '@/queries/keys'
import { upsertDialog } from '@/queries/historyCache'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { MemberPicker } from './MemberPicker'
import type { PublicUser } from '@/lib/api/types'

/** Cap 50 INCLUDING the caller, so 49 others is the ceiling. Minimum one other member. */
const MAX_MEMBERS_INCLUDING_ME = 50

export function GroupCreatePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  /**
   * Minted once for this form, not per attempt. It IS the idempotency key: a create that times out
   * after the server made the group, then a retry, must return that same group rather than a twin.
   */
  const [dialogId] = useState(() => crypto.randomUUID())
  const [members, setMembers] = useState<PublicUser[]>([])

  const create = useMutation({
    mutationFn: () =>
      createGroupDialog({
        dialogId,
        title: title.trim(),
        memberIds: members.map((user) => user.id),
      }),
    onSuccess: (dialog) => {
      upsertDialog(qc, dialog)
      void qc.invalidateQueries({ queryKey: qk.dialogs })
      navigate(`/d/${dialog.dialogId}`, { replace: true })
    },
  })

  const remainingSlots = MAX_MEMBERS_INCLUDING_ME - 1 - members.length
  const canCreate = title.trim().length > 0 && members.length >= 1

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold">New group</h1>

      <Input label="Group name" value={title} onChange={(e) => setTitle(e.target.value)} required />

      <MemberPicker selected={members} onChange={setMembers} remainingSlots={remainingSlots} />

      <p className="text-xs text-zinc-500">
        {members.length + 1} of {MAX_MEMBERS_INCLUDING_ME} members. You are the owner and cannot leave —
        you can delete the group instead.
      </p>

      {create.isError ? <p className="text-sm text-red-400">{friendlyError(create.error)}</p> : null}

      <div className="flex gap-2">
        <Button disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Spinner /> : null}
          Create group
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
