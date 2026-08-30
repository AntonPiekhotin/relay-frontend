import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteAvatar, updateMe, uploadAvatar } from '@/lib/api/users'
import { friendlyError } from '@/lib/api/errors'
import { qk } from '@/queries/keys'
import { initialsOf, useMe } from '@/queries/useUser'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'

/** The server rejects anything larger with a 413; check here so the byte upload never happens. */
const MAX_AVATAR_BYTES = 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function ProfilePage() {
  const qc = useQueryClient()
  const me = useMe()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const edited = useRef(false)
  const filePicker = useRef<HTMLInputElement | null>(null)

  /**
   * `PUT /user/me` is a genuine PUT: both fields replace the pair wholesale, so a stale value
   * posted back would overwrite a change made on another device. Seed the form from a fresh read —
   * but only while it is untouched, or an avatar upload's refetch would wipe a half-typed name.
   */
  useEffect(() => {
    if (!me.data || edited.current) return
    setFirstName(me.data.firstName)
    setLastName(me.data.lastName)
  }, [me.data])

  const save = useMutation({
    mutationFn: () => updateMe({ firstName: firstName.trim(), lastName: lastName.trim() }),
    onSuccess: (profile) => {
      edited.current = false
      qc.setQueryData(qk.me, profile)
    },
  })

  const avatar = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.me }),
  })

  const clearAvatar = useMutation({
    mutationFn: () => deleteAvatar(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.me }),
  })

  if (me.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-8 overflow-y-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Your profile</h1>

      <section className="flex items-center gap-4">
        <Avatar avatarUrl={me.data?.avatarUrl} userId={me.data?.id} initials={initialsOf(me.data)} size="lg" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => filePicker.current?.click()}>
              {avatar.isPending ? <Spinner /> : null}
              Change picture
            </Button>
            {me.data?.avatarUrl ? (
              <Button variant="ghost" size="sm" onClick={() => clearAvatar.mutate()}>
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500">PNG, JPEG, WebP or GIF, up to 1 MB.</p>
          {fileError ? <p className="text-xs text-red-400">{fileError}</p> : null}
          {avatar.isError ? <p className="text-xs text-red-400">{friendlyError(avatar.error)}</p> : null}
          <input
            ref={filePicker}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setFileError(null)
              if (file.size > MAX_AVATAR_BYTES) {
                setFileError('That picture is larger than 1 MB.')
                return
              }
              // The server sniffs the real type from the bytes, so expect it to disagree with this.
              if (!ACCEPTED.includes(file.type)) {
                setFileError('That file type is not supported.')
                return
              }
              avatar.mutate(file)
            }}
          />
        </div>
      </section>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="flex gap-3">
          <Input
            label="First name"
            required
            value={firstName}
            onChange={(e) => {
              edited.current = true
              setFirstName(e.target.value)
            }}
          />
          <Input
            label="Last name"
            required
            value={lastName}
            onChange={(e) => {
              edited.current = true
              setLastName(e.target.value)
            }}
          />
        </div>
        <Input label="Email" value={me.data?.email ?? ''} disabled readOnly />

        {save.isError ? <p className="text-sm text-red-400">{friendlyError(save.error)}</p> : null}
        {save.isSuccess ? <p className="text-sm text-zinc-400">Saved.</p> : null}

        <Button type="submit" disabled={save.isPending || !firstName.trim() || !lastName.trim()}>
          {save.isPending ? <Spinner /> : null}
          Save
        </Button>
      </form>
    </div>
  )
}
