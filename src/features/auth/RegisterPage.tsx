import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { register } from '@/lib/api/auth'
import { friendlyAuthError } from '@/lib/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useT } from '@/lib/i18n'

/** There is no "confirm password" field on the wire — it is a form concern we own. */
export function RegisterPage() {
  const t = useT()
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const signedIn = useAuthStore((s) => Boolean(s.accessToken))
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const mismatch = confirm.length > 0 && confirm !== password

  const mutation = useMutation({
    mutationFn: () =>
      register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      }),
    // Register returns a token pair, so it logs you in. There is no second call.
    onSuccess: (tokens) => {
      setSession(tokens)
      navigate('/', { replace: true })
    },
  })

  if (signedIn) return <Navigate to="/" replace />

  return (
    <main className="flex h-full items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (mismatch) return
          mutation.mutate()
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">{t.auth.registerTitle}</h1>
            <p className="text-sm text-fg-muted">{t.auth.registerSubtitle}</p>
          </div>
          {/* The theme is a device preference, so it has to be reachable before there is an account. */}
          <ThemeToggle className="-mr-2" />
        </div>

        <div className="flex gap-3">
          <Input
            label={t.auth.firstName}
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label={t.auth.lastName}
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <Input
          label={t.auth.email}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label={t.auth.password}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label={t.auth.confirmPassword}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
        />

        {mismatch ? (
          <p role="alert" className="text-sm text-danger">
            {t.auth.passwordsMismatch}
          </p>
        ) : null}
        {mutation.isError ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyAuthError(mutation.error)}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={mutation.isPending || mismatch}>
          {mutation.isPending ? <Spinner /> : null}
          {t.auth.createAccount}
        </Button>

        <p className="text-center text-sm text-fg-muted">
          {t.auth.haveAccount}{' '}
          <Link to="/login" className="text-accent hover:underline">
            {t.auth.signIn}
          </Link>
        </p>
      </form>
    </main>
  )
}
