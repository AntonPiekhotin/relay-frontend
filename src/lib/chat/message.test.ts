import { describe, expect, it } from 'vitest'
import {
  fromHistoryRow,
  fromMessageCall,
  fromMessageNew,
  isCallMessage,
  isSystemMessage,
  isUnreadCall,
  mergeMessages,
} from './message'
import type { ChatMessage } from './message'
import type { HistoryMessage } from '@/lib/api/types'

const optimistic: ChatMessage = {
  messageId: null,
  clientMsgId: 'c-1',
  dialogId: 'd-1',
  senderId: 'me',
  text: 'hello',
  createdAt: '2026-07-26T10:00:00.000Z',
  kind: 'user',
  targetUserId: null,
  state: 'PENDING',
}

/** Somebody else's row, and every system row, arrives with no `clientMsgId` key at all. */
function foreignRow(messageId: string, createdAt: string): HistoryMessage {
  return {
    messageId,
    dialogId: 'd-1',
    senderId: 'them',
    text: 'hello',
    createdAt,
    kind: 'user',
    targetUserId: null,
  }
}

const historyRow: HistoryMessage = {
  messageId: 'm-1',
  dialogId: 'd-1',
  senderId: 'me',
  text: 'hello',
  createdAt: '2026-07-26T10:00:02.000Z',
  clientMsgId: 'c-1',
  kind: 'user',
  targetUserId: null,
}

describe('message merge', () => {
  it('collapses a history row onto the optimistic row it belongs to', () => {
    const merged = mergeMessages([optimistic], [fromHistoryRow(historyRow)])

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ messageId: 'm-1', clientMsgId: 'c-1', state: 'SENT' })
  })

  it('takes the server createdAt, which may reorder the message', () => {
    const earlier: ChatMessage = { ...optimistic, clientMsgId: 'c-0', createdAt: '2026-07-26T10:00:01.000Z' }
    const merged = mergeMessages([optimistic, earlier], [fromHistoryRow(historyRow)])

    expect(merged.map((m) => m.clientMsgId)).toEqual(['c-0', 'c-1'])
  })

  it('deduplicates on messageId when there is no clientMsgId to key on', () => {
    const incoming = fromMessageNew({
      message_id: 'm-2',
      dialog_id: 'd-1',
      sender_id: 'someone',
      text: 'hi',
      created_at: '2026-07-26T10:00:03.000Z',
    })

    const merged = mergeMessages([incoming], [incoming])
    expect(merged).toHaveLength(1)
  })

  it('never keys somebody elses row on a clientMsgId, because they never carry one', () => {
    const theirs = fromHistoryRow(foreignRow('m-3', historyRow.createdAt))
    const merged = mergeMessages([optimistic], [theirs])

    expect(merged).toHaveLength(2)
  })

  it('sorts by (createdAt, messageId) so messages sharing a timestamp are stable', () => {
    const sameInstant = '2026-07-26T10:00:00.000Z'
    const a = fromHistoryRow(foreignRow('m-b', sameInstant))
    const b = fromHistoryRow(foreignRow('m-a', sameInstant))

    expect(mergeMessages([], [a, b]).map((m) => m.messageId)).toEqual(['m-a', 'm-b'])
    expect(mergeMessages([], [b, a]).map((m) => m.messageId)).toEqual(['m-a', 'm-b'])
  })

  it('takes a group_renamed history row title from `text`, where the server puts it', () => {
    const renamed = fromHistoryRow({
      messageId: 'm-9',
      dialogId: 'd-1',
      senderId: 'them',
      text: 'crew',
      createdAt: '2026-07-26T10:00:00.000Z',
      kind: 'group_renamed',
      targetUserId: null,
    })

    expect(renamed.title).toBe('crew')
  })

  it('leaves a normal row with no title', () => {
    expect(fromHistoryRow(historyRow).title).toBeNull()
  })

  it('treats receiving a message you already hold as normal', () => {
    const row = fromHistoryRow(historyRow)
    expect(mergeMessages([row], [row, row])).toHaveLength(1)
  })
})

describe('call rows', () => {
  const frame = {
    message_id: 'm-call',
    dialog_id: 'd-1',
    caller_id: 'them',
    call_id: 'call-1',
    media: 'video',
    outcome: 'missed',
    duration_s: null,
    created_at: '2026-07-26T10:00:05.000Z',
  }

  it('merges the live frame and the history row into one call row', () => {
    const live = fromMessageCall(frame)
    const history = fromHistoryRow({
      messageId: 'm-call',
      dialogId: 'd-1',
      senderId: 'them',
      text: '',
      createdAt: frame.created_at,
      kind: 'call',
      targetUserId: null,
      call: { callId: 'call-1', media: 'video', outcome: 'missed', durationSeconds: null },
    })

    const merged = mergeMessages([live], [history])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.call).toEqual(history.call)
    expect(isCallMessage(live)).toBe(true)
    expect(isSystemMessage(live)).toBe(false)
  })

  it('counts a call as unread only for a callee who never picked up', () => {
    expect(isUnreadCall('them', 'missed', 'me')).toBe(true)
    expect(isUnreadCall('them', 'canceled', 'me')).toBe(true)
    expect(isUnreadCall('them', 'completed', 'me')).toBe(false)
    expect(isUnreadCall('them', 'declined', 'me')).toBe(false)
    expect(isUnreadCall('me', 'missed', 'me')).toBe(false)
  })

  it('renders an unknown call kind without call details as a neutral system row', () => {
    const row = fromHistoryRow({ ...foreignRow('m-x', frame.created_at), kind: 'call' })
    expect(isCallMessage(row)).toBe(false)
    expect(isSystemMessage(row)).toBe(true)
  })
})
