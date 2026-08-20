import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACK_TIMEOUT_MS,
  MAX_PENDING_PER_DIALOG,
  dueEntries,
  entriesForDialog,
  retryDelay,
  useOutboxStore,
} from './outboxStore'

const store = () => useOutboxStore.getState()

describe('outbox', () => {
  beforeEach(() => {
    store().clear()
  })

  it('mints a clientMsgId once and keeps it across a retry', () => {
    const entry = store().enqueue('d-1', 'hello')
    expect(entry).not.toBeNull()
    const id = entry?.clientMsgId as string

    store().markAttempted(id)
    store().markFailed(id, 'SEND_FAILED')
    store().retry(id)

    const after = store().entries[id]
    expect(after?.clientMsgId).toBe(id)
    expect(after?.state).toBe('PENDING')
    expect(after?.attempts).toBe(0)
  })

  it('promotes on ack by removing the entry — the real row replaces it', () => {
    const id = store().enqueue('d-1', 'hi')?.clientMsgId as string
    store().markSent(id)
    expect(store().entries[id]).toBeUndefined()
  })

  it('marks a permanent failure as FAILED rather than retrying forever', () => {
    const id = store().enqueue('d-1', 'hi')?.clientMsgId as string
    store().markFailed(id, 'DIALOG_NOT_FOUND')
    expect(store().entries[id]?.state).toBe('FAILED')
    expect(dueEntries(store().entries)).toHaveLength(0)
  })

  it('backs off after each attempt, capped', () => {
    expect(retryDelay(1)).toBe(ACK_TIMEOUT_MS)
    expect(retryDelay(2)).toBe(ACK_TIMEOUT_MS * 2)
    expect(retryDelay(99)).toBe(60_000)
  })

  it('does not treat a message as due until its backoff has elapsed', () => {
    const id = store().enqueue('d-1', 'hi')?.clientMsgId as string
    expect(dueEntries(store().entries)).toHaveLength(1)

    store().markAttempted(id)
    expect(dueEntries(store().entries)).toHaveLength(0)
    expect(dueEntries(store().entries, Date.now() + ACK_TIMEOUT_MS + 1)).toHaveLength(1)
  })

  it('caps the queue per dialog instead of growing without bound', () => {
    for (let i = 0; i < MAX_PENDING_PER_DIALOG; i++) store().enqueue('d-1', `m${i}`)
    expect(store().enqueue('d-1', 'one too many')).toBeNull()
    // Another conversation is unaffected — the cap is per dialog.
    expect(store().enqueue('d-2', 'fine')).not.toBeNull()
  })

  it('counts only PENDING against the cap, so failures do not wedge a conversation', () => {
    for (let i = 0; i < MAX_PENDING_PER_DIALOG; i++) {
      const id = store().enqueue('d-1', `m${i}`)?.clientMsgId as string
      store().markFailed(id, 'DIALOG_NOT_FOUND')
    }
    // Fifty dead rows are the user's to retry or discard — they must not block the next message.
    expect(store().enqueue('d-1', 'still fine')).not.toBeNull()
  })

  it('keeps a dialog view in local send order', () => {
    store().enqueue('d-1', 'first')
    store().enqueue('d-2', 'elsewhere')
    store().enqueue('d-1', 'second')
    expect(entriesForDialog(store().entries, 'd-1').map((e) => e.text)).toEqual(['first', 'second'])
  })
})
