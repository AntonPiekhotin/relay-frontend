import {useEffect, useRef, useState} from 'react'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {changePassword} from '@/lib/api/auth'
import {ApiError} from '@/lib/api/client'
import {deleteAvatar, updateMe, uploadAvatar} from '@/lib/api/users'
import {friendlyError} from '@/lib/api/errors'
import {qk} from '@/queries/keys'
import {initialsOf, useMe} from '@/queries/useUser'
import {Avatar} from '@/components/Avatar'
import {Button} from '@/components/Button'
import {Input} from '@/components/Input'
import {Modal} from '@/components/Modal'
import {Spinner} from '@/components/Spinner'
import {ThemePicker} from '@/components/ThemePicker'
import {LanguagePicker} from '@/components/LanguagePicker'
import {clearAvatarCache} from '@/lib/avatar'
import {signOut} from '@/stores/authStore'
import {useOutboxStore} from '@/stores/outboxStore'
import {useT} from '@/lib/i18n'

/** The server rejects anything larger with a 413; check here so the byte upload never happens. */
const MAX_AVATAR_BYTES = 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export function ProfilePage() {
    const t = useT()
    const qc = useQueryClient()
    const me = useMe()
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [fileError, setFileError] = useState<string | null>(null)
    const [confirmingSignOut, setConfirmingSignOut] = useState(false)
    const [changingPassword, setChangingPassword] = useState(false)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
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
        mutationFn: () => updateMe({firstName: firstName.trim(), lastName: lastName.trim()}),
        onSuccess: (profile) => {
            edited.current = false
            qc.setQueryData(qk.me, profile)
        },
    })

    const avatar = useMutation({
        mutationFn: (file: File) => uploadAvatar(file),
        onSuccess: () => void qc.invalidateQueries({queryKey: qk.me}),
    })

    const clearAvatar = useMutation({
        mutationFn: () => deleteAvatar(),
        onSuccess: () => void qc.invalidateQueries({queryKey: qk.me}),
    })

    const password = useMutation({
        mutationFn: () => changePassword({currentPassword, newPassword}),
        // 204, and existing tokens stay valid — nothing to store, nothing to refetch.
        onSuccess: () => setChangingPassword(false),
    })

    /**
     * The generic status map reads a 401 as an expired session and a 400 as a malformed request;
     * on this endpoint they mean a wrong current password and a rejected new one.
     */
    function passwordError(error: unknown): string {
        if (error instanceof ApiError) {
            if (error.status === 401) return t.profile.currentPasswordWrong
            if (error.status === 400) return t.profile.newPasswordRejected
        }
        return friendlyError(error)
    }

    function openPasswordModal() {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        password.reset()
        setChangingPassword(true)
    }

    const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword

    /**
     * Everything cached belongs to the account that is leaving: the object URLs point at its avatar
     * bytes, and its queued messages must not be flushed by whoever signs in next — the same
     * clientMsgId would be sent from a different account.
     */
    function performSignOut() {
        clearAvatarCache()
        useOutboxStore.getState().clear()
        qc.clear()
        signOut()
    }

    if (me.isPending) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spinner className="size-6"/>
            </div>
        )
    }

    return (
        <div className="mx-auto w-full max-w-lg space-y-8 overflow-y-auto p-4 sm:p-6">
            <h1 className="text-lg font-semibold">{t.profile.title}</h1>

            <section className="flex items-center gap-4">
                <Avatar avatarUrl={me.data?.avatarUrl} userId={me.data?.id} initials={initialsOf(me.data)} size="lg"/>
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => filePicker.current?.click()}>
                            {avatar.isPending ? <Spinner/> : null}
                            {t.profile.changePicture}
                        </Button>
                        {me.data?.avatarUrl ? (
                            <Button variant="ghost" size="sm" onClick={() => clearAvatar.mutate()}>
                                {t.common.remove}
                            </Button>
                        ) : null}
                    </div>
                    <p className="text-xs text-fg-subtle">{t.profile.pictureHint}</p>
                    {fileError ? <p className="text-xs text-danger">{fileError}</p> : null}
                    {avatar.isError ? <p className="text-xs text-danger">{friendlyError(avatar.error)}</p> : null}
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
                                setFileError(t.profile.pictureTooLarge)
                                return
                            }
                            // The server sniffs the real type from the bytes, so expect it to disagree with this.
                            if (!ACCEPTED.includes(file.type)) {
                                setFileError(t.profile.pictureUnsupported)
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
                        label={t.auth.firstName}
                        required
                        value={firstName}
                        onChange={(e) => {
                            edited.current = true
                            setFirstName(e.target.value)
                        }}
                    />
                    <Input
                        label={t.auth.lastName}
                        required
                        value={lastName}
                        onChange={(e) => {
                            edited.current = true
                            setLastName(e.target.value)
                        }}
                    />
                </div>
                <Input label={t.auth.email} value={me.data?.email ?? ''} disabled readOnly/>

                {save.isError ? <p className="text-sm text-danger">{friendlyError(save.error)}</p> : null}
                {save.isSuccess ? <p className="text-sm text-fg-muted">{t.common.saved}</p> : null}

                <Button type="submit" disabled={save.isPending || !firstName.trim() || !lastName.trim()}>
                    {save.isPending ? <Spinner/> : null}
                    {t.common.save}
                </Button>
            </form>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold">{t.profile.appearance}</h2>
                <ThemePicker/>
            </section>

            <section className="space-y-2">
                <h2 className="text-sm font-semibold">{t.language.label}</h2>
                <LanguagePicker/>
            </section>

            <section className="space-y-2 border-t border-border-subtle pt-6">
                <h2 className="text-sm font-semibold">{t.profile.account}</h2>
                <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={openPasswordModal}>
                        {t.profile.changePassword}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirmingSignOut(true)}>
                        {t.profile.signOut}
                    </Button>
                </div>
                {password.isSuccess ? <p className="text-sm text-fg-muted">{t.profile.passwordChanged}</p> : null}
            </section>

            <Modal
                open={changingPassword}
                title={t.profile.changePassword}
                onClose={() => setChangingPassword(false)}
                footer={
                    <>
                        <Button variant="secondary" size="sm" onClick={() => setChangingPassword(false)}>
                            {t.common.cancel}
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            form="change-password"
                            disabled={password.isPending || passwordsMismatch}
                        >
                            {password.isPending ? <Spinner/> : null}
                            {t.profile.changePassword}
                        </Button>
                    </>
                }
            >
                <form
                    id="change-password"
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        if (passwordsMismatch) return
                        password.mutate()
                    }}
                >
                    <Input
                        label={t.profile.currentPassword}
                        type="password"
                        autoComplete="current-password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <Input
                        label={t.profile.newPassword}
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Input
                        label={t.auth.confirmPassword}
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        aria-invalid={passwordsMismatch}
                    />
                    {passwordsMismatch ? (
                        <p role="alert" className="text-sm text-danger">
                            {t.auth.passwordsMismatch}
                        </p>
                    ) : null}
                    {password.isError ? (
                        <p role="alert" className="text-sm text-danger">
                            {passwordError(password.error)}
                        </p>
                    ) : null}
                </form>
            </Modal>

            <Modal
                open={confirmingSignOut}
                title={t.profile.signOutTitle}
                onClose={() => setConfirmingSignOut(false)}
                footer={
                    <>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmingSignOut(false)}>
                            {t.common.cancel}
                        </Button>
                        <Button variant="danger" size="sm" onClick={performSignOut}>
                            {t.profile.signOut}
                        </Button>
                    </>
                }
            >
                {t.profile.signOutBody}
            </Modal>
        </div>
    )
}
