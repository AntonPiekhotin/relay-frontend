import { describe, expect, it } from 'vitest'
import { decodeFrame, encodeFrame, makeFrame } from './codec'
import { PROTOCOL_VERSION } from './types'
import type { AckPayload, MessageSendPayload } from './types'

describe('codec', () => {
  it('round-trips an outbound frame with snake_case payload keys intact', () => {
    const frame = makeFrame<MessageSendPayload>(
      'message.send',
      { dialog_id: 'd-1', text: 'hello' },
      'client-msg-1',
    )

    const wire = JSON.parse(encodeFrame(frame)) as Record<string, unknown>

    expect(wire).toMatchObject({ v: PROTOCOL_VERSION, type: 'message.send', id: 'client-msg-1' })
    expect(typeof wire.ts).toBe('number')
    expect(wire.payload).toEqual({ dialog_id: 'd-1', text: 'hello' })
  })

  it('keeps the supplied id, because the id of a message.send IS the client_msg_id', () => {
    const first = makeFrame('message.send', { dialog_id: 'd', text: 't' }, 'fixed')
    const retry = makeFrame('message.send', { dialog_id: 'd', text: 't' }, 'fixed')
    expect(retry.id).toBe(first.id)
  })

  it('decodes a server frame, which carries no id', () => {
    const decoded = decodeFrame(
      JSON.stringify({
        v: 1,
        type: 'ack',
        ts: 1730000000123,
        payload: { client_msg_id: 'c-1', message_id: 'm-1', created_at: '2026-07-26T10:00:00Z' },
      }),
    )

    expect(decoded?.type).toBe('ack')
    expect((decoded?.payload as AckPayload).client_msg_id).toBe('c-1')
  })

  it('passes unknown frame types through — dropping them is the dispatcher, not the codec', () => {
    const decoded = decodeFrame(JSON.stringify({ v: 1, type: 'something.new', ts: 1, payload: {} }))
    expect(decoded?.type).toBe('something.new')
  })

  it('returns null for anything unusable rather than throwing', () => {
    expect(decodeFrame('not json')).toBeNull()
    expect(decodeFrame(JSON.stringify([1, 2, 3]))).toBeNull()
    expect(decodeFrame(JSON.stringify({ v: 1, ts: 1, payload: {} }))).toBeNull()
    expect(decodeFrame(new ArrayBuffer(4))).toBeNull()
  })

  it('tolerates a missing payload', () => {
    expect(decodeFrame(JSON.stringify({ v: 1, type: 'pong', ts: 1 }))?.payload).toEqual({})
  })
})
