import { act, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCallStore } from '@/stores/callStore'
import { qk } from '@/queries/keys'
import { CallOverlay } from './CallOverlay'

/**
 * The caller's side of a direct call. These assert the thing the surface exists for: that placing a
 * call shows *who* is being called and *what stage it has reached*, rather than a black rectangle.
 */

const PEER = {
  id: 'peer-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  avatarUrl: null,
}

function renderOverlay() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seeded rather than fetched: the peer's name is an input to this test, not a network round trip.
  client.setQueryData(qk.user(PEER.id), PEER)
  return render(
    <QueryClientProvider client={client}>
      <CallOverlay />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  // Inside `act`, because this hook runs before Testing Library's own cleanup: the overlay is still
  // mounted and subscribed when the store is emptied.
  act(() => useCallStore.getState().reset())
  vi.useRealTimers()
})

describe('CallOverlay, outgoing', () => {
  it('names the peer and says the invite is still on its way', () => {
    useCallStore.getState().setCall({
      kind: 'outgoing',
      callId: 'call-1',
      peerId: PEER.id,
      media: 'audio',
      ringExpiresAt: null,
      status: 'connecting',
    })

    renderOverlay()

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText(/Connecting…/)).toBeInTheDocument()
    expect(screen.getByText('Voice call')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hang up' })).toBeInTheDocument()
  })

  it("says it is ringing once the server's state verb has landed", () => {
    useCallStore.getState().setCall({
      kind: 'outgoing',
      callId: 'call-1',
      peerId: PEER.id,
      media: 'video',
      ringExpiresAt: null,
      status: 'ringing',
    })

    renderOverlay()

    expect(screen.getByText(/Ringing…/)).toBeInTheDocument()
    expect(screen.getByText('Video call')).toBeInTheDocument()
    // A video call shows the local camera while it rings — proof the mic and camera are live.
    expect(screen.getByLabelText('Your camera')).toBeInTheDocument()
  })

  it('shows no timer while it rings — ring time is not call time', () => {
    useCallStore.getState().setCall({
      kind: 'outgoing',
      callId: 'call-1',
      peerId: PEER.id,
      media: 'audio',
      ringExpiresAt: null,
      status: 'ringing',
    })

    renderOverlay()

    expect(screen.getByText('Ringing…')).toBeInTheDocument()
    expect(screen.queryByText(/\d+:\d\d/)).not.toBeInTheDocument()
  })
})

describe('CallOverlay, connected', () => {
  it('starts the duration at the moment the call was answered', () => {
    useCallStore.getState().setCall({
      kind: 'connected',
      callId: 'call-1',
      peerId: PEER.id,
      media: 'audio',
      startedAt: Date.now() - 65_000,
    })

    renderOverlay()

    expect(screen.getByText(/Connected · 1:05/)).toBeInTheDocument()
  })
})

describe('CallOverlay, after the call', () => {
  it('says how the call ended, and clears the notice by itself', () => {
    vi.useFakeTimers()
    useCallStore.getState().setError('No answer.')

    renderOverlay()
    expect(screen.getByRole('alert')).toHaveTextContent('No answer.')

    act(() => vi.advanceTimersByTime(6000))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
