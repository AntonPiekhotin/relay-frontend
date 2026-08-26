import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { initAuth } from '@/stores/authStore'
import App from './App'

/**
 * A smoke test for the shell: with no session, every route behind the guard redirects to the sign-in
 * screen, and the app mounts without touching the network.
 */
describe('App', () => {
  // What `main.tsx` does on boot; without it the guard sits on its spinner waiting to be hydrated.
  beforeEach(() => {
    initAuth()
  })

  it('lands on the sign-in screen when there is no session', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Relay' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})
