import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { login } from '@/lib/api/auth'
import { friendlyAuthError } from '@/lib/api/errors'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const signedIn = useAuthStore((s) => Boolean(s.accessToken))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => login({ email: email.trim(), password }),
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
          mutation.mutate()
        }}
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Relay</h1>
          <p className="text-sm text-zinc-400">Sign in to your account.</p>
        </div>

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mutation.isError ? (
          <p role="alert" className="text-sm text-red-400">
            {friendlyAuthError(mutation.error)}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null}
          Sign in
        </Button>

        <p className="text-center text-sm text-zinc-400">
          No account?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </main>
  )
}
