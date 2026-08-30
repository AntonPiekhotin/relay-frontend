import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { LoginPage } from '@/features/auth/LoginPage'
import { useThemeStore } from '@/stores/themeStore'

describe('Button', () => {
  /**
   * A bare `<button>` is `type="submit"`. Every icon button in this app is a `<Button>`, and
   * several sit inside forms — an implicit submit there makes them fire the form instead of, or as
   * well as, their own handler. Submitting is opt-in.
   */
  it('is not a submit button unless it asks to be', () => {
    render(
      <>
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Plain' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })
})

describe('LoginPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    document.documentElement.className = ''
    useThemeStore.setState({ preference: 'dark', resolved: 'dark' })
  })

  /**
   * Enter in a text field is an *implicit submission*, and the browser performs it by activating
   * the form's first submit button — which is the theme toggle, since it sits above the real one.
   * Signing in must not repaint the app.
   */
  it('does not change the theme when the form is submitted with Enter', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'hunter2{Enter}')

    expect(useThemeStore.getState().resolved).toBe('dark')
  })
})
