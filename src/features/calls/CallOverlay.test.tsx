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
      placedAt: Date.now(),
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
      placedAt: Date.now(),
    })

    renderOverlay()

    expect(screen.getByText(/Ringing…/)).toBeInTheDocument()
    expect(screen.getByText('Video call')).toBeInTheDocument()
    // A video call shows the local camera while it rings — proof the mic and camera are live.
    expect(screen.getByLabelText('Your camera')).toBeInTheDocument()
  })

  it('counts up from when the call was placed', () => {
    useCallStore.getState().setCall({
      kind: 'outgoing',
      callId: 'call-1',
      peerId: PEER.id,
      media: 'audio',
      ringExpiresAt: null,
      placedAt: Date.now() - 7000,
      status: 'ringing',
    })

    renderOverlay()

    expect(screen.getByText(/Ringing… · 0:07/)).toBeInTheDocument()
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
