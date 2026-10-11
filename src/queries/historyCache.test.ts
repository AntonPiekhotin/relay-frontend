import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { insertHistoryMessages } from './historyCache'
import type { HistoryQueryData } from './useHistory'
import { qk } from './keys'
import { fromMessageCall, isCallMessage, fromHistoryRow } from '@/lib/chat/message'

describe('history cache', () => {
  it('keeps the call details of a live message.call row — without them it renders as a system row', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.history('d-1'), {
      pages: [{ messages: [], nextCursor: null }],
      pageParams: [null],
    } as unknown as HistoryQueryData)

    insertHistoryMessages(qc, 'd-1', [
      fromMessageCall({
        message_id: 'm-1',
        dialog_id: 'd-1',
        caller_id: 'me',
        call_id: 'c-1',
        media: 'audio',
        outcome: 'completed',
        duration_s: 42,
        created_at: '2026-10-11T10:00:00.000Z',
      }),
    ])

    const row = qc.getQueryData<HistoryQueryData>(qk.history('d-1'))?.pages[0]?.messages[0]
    expect(row?.call).toEqual({ callId: 'c-1', media: 'audio', outcome: 'completed', durationSeconds: 42 })
    expect(row && isCallMessage(fromHistoryRow(row))).toBe(true)
  })
})
