import { describe, expect, it } from 'vitest'
import { isReadByAnyone, seenByCount } from './useReadState'
import type { ReadStateEntry } from '@/lib/api/types'
import type { ChatMessage } from '@/lib/chat/message'

function message(createdAt: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    messageId: 'm-1',
    clientMsgId: null,
    dialogId: 'd-1',
    senderId: 'me',
    text: 'hi',
    createdAt,
    kind: 'user',
    targetUserId: null,
    state: 'SENT',
    ...over,
  }
}

function entry(userId: string, lastReadAt: string): ReadStateEntry {
  return { userId, lastReadMessageId: 'x', lastReadAt }
}

describe('read state', () => {
  it('reads a message whose createdAt is at or before somebody cursor', () => {
    const mine = message('2026-07-26T10:00:00.000Z')
    expect(isReadByAnyone([entry('them', '2026-07-26T10:00:00.000Z')], mine, 'me')).toBe(true)
    expect(isReadByAnyone([entry('them', '2026-07-26T10:00:01.000Z')], mine, 'me')).toBe(true)
    expect(isReadByAnyone([entry('them', '2026-07-26T09:59:59.000Z')], mine, 'me')).toBe(false)
  })

  it('ignores your own cursor — reading your own message is not a read receipt', () => {
    const mine = message('2026-07-26T10:00:00.000Z')
    expect(isReadByAnyone([entry('me', '2026-07-26T12:00:00.000Z')], mine, 'me')).toBe(false)
  })

  it('never marks an unacked message as read — it has no server position yet', () => {
    const pending = message('2026-07-26T10:00:00.000Z', { messageId: null, clientMsgId: 'c-1', state: 'PENDING' })
    expect(isReadByAnyone([entry('them', '2026-07-26T23:00:00.000Z')], pending, 'me')).toBe(false)
  })

  it('counts seen-by from present entries only — a member who never read is absent, not zero', () => {
    const mine = message('2026-07-26T10:00:00.000Z')
    const entries = [entry('a', '2026-07-26T10:00:00.000Z'), entry('b', '2026-07-26T09:00:00.000Z')]
    expect(seenByCount(entries, mine, 'me')).toBe(1)
  })
})
