import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import { LoginPage } from './LoginPage'

const loginMock = vi.fn()
vi.mock('@/lib/api/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
}))

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset()
    useAuthStore.getState().signOut()
  })

  it('signs in on its own when the link carries email and password', async () => {
    loginMock.mockResolvedValue({ access_token: 'a', refresh_token: 'r', expires_in: 300 })

    renderAt('/login?email=grandma%40example.com&password=p%26ss')

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1))
    expect(loginMock).toHaveBeenCalledWith({ email: 'grandma@example.com', password: 'p&ss' })
    expect(await screen.findByText('home')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('a')
  })

  it('only prefills when one of the two is missing', () => {
    renderAt('/login?email=grandma%40example.com')

    expect(screen.getByLabelText('Email')).toHaveValue('grandma@example.com')
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('does nothing special without params', () => {
    renderAt('/login')

    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(loginMock).not.toHaveBeenCalled()
  })
})
