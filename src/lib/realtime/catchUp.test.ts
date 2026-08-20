import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { catchUpDialog, runReconnectSequence } from './catchUp'
import { qk } from '@/queries/keys'
import type { HistoryMessage, MessageHistoryResponse } from '@/lib/api/types'

const getHistoryAfter = vi.fn<(dialogId: string, after: string, limit?: number) => Promise<MessageHistoryResponse>>()

vi.mock('@/lib/api/messages', () => ({
  getHistoryAfter: (dialogId: string, after: string, limit?: number) => getHistoryAfter(dialogId, after, limit),
  getHistory: vi.fn(),
}))

function row(id: string, minute: number): HistoryMessage {
  return {
    messageId: id,
    dialogId: 'd-1',
    senderId: 'them',
    text: id,
    createdAt: `2026-07-26T10:${String(minute).padStart(2, '0')}:00.000Z`,
    kind: 'user',
    targetUserId: null,
  }
}

function seed(qc: QueryClient, dialogId: string, messages: HistoryMessage[]): void {
  qc.setQueryData(qk.history(dialogId), { pages: [{ messages, nextCursor: null }], pageParams: [null] })
}

describe('catch-up', () => {
  let qc: QueryClient

  beforeEach(() => {
    getHistoryAfter.mockReset()
    qc = new QueryClient()
  })

  it('pages forward until a page comes back short', async () => {
    seed(qc, 'd-1', [row('m-1', 0)])
    const full = Array.from({ length: 100 }, (_, i) => row(`s-${i}`, 1))
    getHistoryAfter
      .mockResolvedValueOnce({ messages: full, nextCursor: null })
      .mockResolvedValueOnce({ messages: [row('s-100', 2)], nextCursor: null })

    const recovered = await catchUpDialog(qc, 'd-1')

    expect(recovered).toBe(101)
    expect(getHistoryAfter).toHaveBeenCalledTimes(2)
    // `after` pages arrive ascending, so the cursor for the next page is the LAST row.
    expect(getHistoryAfter.mock.calls[0]?.[1]).toBe('m-1')
    expect(getHistoryAfter.mock.calls[1]?.[1]).toBe('s-99')
  })

  it('asks for nothing when there is no local history to have a gap in', async () => {
    expect(await catchUpDialog(qc, 'd-unknown')).toBe(0)
    expect(getHistoryAfter).not.toHaveBeenCalled()
  })

  it('never sends an optimistic id as the cursor — the server has never heard of one', async () => {
    // A cache holding only an unacked local row has no server id to page from.
    seed(qc, 'd-1', [])
    expect(await catchUpDialog(qc, 'd-1')).toBe(0)
    expect(getHistoryAfter).not.toHaveBeenCalled()
  })

  it('runs the recovery in order: dialogs, catch-up open dialog first, flush, reads, presence', async () => {
    seed(qc, 'd-1', [row('m-1', 0)])
    seed(qc, 'd-2', [row('m-2', 0)])
    getHistoryAfter.mockResolvedValue({ messages: [], nextCursor: null })

    const order: string[] = []
    await runReconnectSequence(qc, {
      openDialogId: 'd-2',
      flushOutbox: () => order.push('flush'),
      resendReads: () => order.push('reads'),
      resubscribePresence: () => order.push('presence'),
    })

    expect(getHistoryAfter.mock.calls.map((call) => call[0])).toEqual(['d-2', 'd-1'])
    expect(order).toEqual(['flush', 'reads', 'presence'])
  })
})
