import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { login } from '@/lib/api/auth'
import { friendlyAuthError } from '@/lib/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useT } from '@/lib/i18n'

export function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const signedIn = useAuthStore((s) => Boolean(s.accessToken))
  const [params] = useSearchParams()
  const linkEmail = params.get('email') ?? ''
  const linkPassword = params.get('password') ?? ''
  const [email, setEmail] = useState(linkEmail)
  const [password, setPassword] = useState(linkPassword)

  const mutation = useMutation({
    mutationFn: () => login({ email: email.trim(), password }),
    onSuccess: (tokens) => {
      setSession(tokens)
      navigate('/', { replace: true })
    },
  })

  const autoSubmitted = useRef(false)
  useEffect(() => {
    if (autoSubmitted.current || signedIn || !linkEmail || !linkPassword) return
    autoSubmitted.current = true
    mutation.mutate()
  }, [linkEmail, linkPassword, signedIn, mutation])

  if (signedIn) return <Navigate to="/" replace />

  return (
    <main className="flex h-full items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Relay</h1>
            <p className="text-sm text-fg-muted">{t.auth.signInSubtitle}</p>
          </div>
          {/* The theme is a device preference, so it has to be reachable before there is an account. */}
          <ThemeToggle className="-mr-2" />
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mutation.isError ? (
          <p role="alert" className="text-sm text-danger">
            {friendlyAuthError(mutation.error)}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          {t.auth.signIn}
        </Button>

        <p className="text-center text-sm text-fg-muted">
          {t.auth.noAccount}{' '}
          <Link to="/register" className="text-accent hover:underline">
            {t.auth.createOne}
          </Link>
        </p>
      </form>
    </main>
  )
}
