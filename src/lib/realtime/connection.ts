/**
 * The realtime connection: one socket for the app, the outbox flusher, and the outbound frames the
 * UI can send. Components never touch the socket directly — sending is an action here.
 */

import type { QueryClient } from '@tanstack/react-query'
import { RelaySocket } from '@/lib/protocol/socket'
import type { SocketStatus } from '@/lib/protocol/socket'
import { makeFrame } from '@/lib/protocol/codec'
import type {
  DialogRefPayload,
  MessageReadOutPayload,
  MessageSendPayload,
  OutboundFrameType,
} from '@/lib/protocol/types'
import { currentAccessToken, refreshSessionDetailed, signOut } from '@/stores/authStore'
import { useSocketStore } from '@/stores/socketStore'
import { dueEntries, useOutboxStore } from '@/stores/outboxStore'
import { setDialogUnread } from '@/queries/historyCache'
import { usePresenceStore } from '@/stores/presenceStore'
import type { OutboxEntry } from '@/stores/outboxStore'
import { teardown as teardownDirectCall } from '@/lib/calls/directCall'
import { teardownGroup } from '@/lib/calls/groupCall'
import { dispatchFrame } from './dispatcher'
import { runReconnectSequence } from './catchUp'

/** How often the outbox is examined. Retries are scheduled per entry; this just wakes up. */
const FLUSH_INTERVAL_MS = 1_000

let socket: RelaySocket | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let queryClient: QueryClient | null = null
/** The conversation on screen: caught up first on reconnect, and the only one presence follows. */
let openDialogId: string | null = null
/** Reads taken while the socket was down, replayed as step 5 of the reconnect sequence. */
const pendingReads = new Map<string, string>()
/** The last position we actually sent per dialog, so scrolling does not emit the same frame twice. */
const sentReads = new Map<string, string>()
/** Leading-edge typing throttle, per dialog: epoch millis of the last emission. */
const lastTypingAt = new Map<string, number>()

/** One emission per 3 seconds per conversation. The server enforces none of this — we do. */
const TYPING_THROTTLE_MS = 3_000

export function startRealtime(client: QueryClient): void {
  queryClient = client
  if (socket) return

  socket = new RelaySocket({
    getToken: currentAccessToken,
    refreshToken: refreshSessionDetailed,
    onStatus: handleStatus,
    onFrame: (frame) => {
      if (!queryClient) return
      dispatchFrame(frame, { queryClient, onSessionConnected: () => void onSessionConnected() })
    },
  })

  socket.connect()
  window.addEventListener('online', reconnectNow)
}

export function stopRealtime(): void {
  window.removeEventListener('online', reconnectNow)
  stopFlushing()
  // Per-session bookkeeping, and it belongs to the account that is leaving: a read position or a
  // typing throttle carried into the next sign-in would act on somebody else's conversations.
  pendingReads.clear()
  sentReads.clear()
  lastTypingAt.clear()
  callFrames.clear()
  // Signing out with a call up would leave the camera light on: nothing else stops those tracks.
  teardownDirectCall()
  teardownGroup()
  socket?.disconnect()
  socket = null
  queryClient = null
  useSocketStore.getState().clearSession()
}

function reconnectNow(): void {
  socket?.reconnectNow()
}

function handleStatus(status: SocketStatus): void {
  useSocketStore.getState().setStatus(status)
  if (status !== 'ready') stopFlushing()
  // The handshake was refused and the refresh token is gone with it. Sign out so the guard sends
  // the user somewhere they can do something about it, rather than showing a dead app — and stop
  // any live media, which no longer has a way to be hung up.
  if (status === 'unauthorized') {
    teardownDirectCall()
    teardownGroup()
    signOut()
  }
}

/** Set by the chat pane. Also cleared when it unmounts — presence must not follow a closed pane. */
export function setOpenDialog(dialogId: string | null): void {
  openDialogId = dialogId
}

export function getOpenDialog(): string | null {
  return openDialogId
}

/**
 * Everything that recovers from a drop hangs off this frame, never off `onopen` — the frame is the
 * only proof the handshake resolved to the identity we expect (docs/REALTIME.md §2).
 */
async function onSessionConnected(): Promise<void> {
  if (!queryClient) return

  await runReconnectSequence(queryClient, {
    openDialogId,
    flushOutbox,
    resendReads,
    resubscribePresence: () => {
      if (openDialogId) subscribePresence(openDialogId)
    },
  })

  // Only now start the periodic sweep: everything due went out as step 5 of the sequence.
  startFlushing()
}

// ─── The outbox flusher ──────────────────────────────────────────────────────

function startFlushing(): void {
  stopFlushing()
  flushTimer = setInterval(flushOutbox, FLUSH_INTERVAL_MS)
}

function stopFlushing(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

/**
 * Send everything that is due. Retry timers effectively pause while disconnected because this only
 * ever runs against a ready socket — burning attempts against a closed socket buys nothing.
 */
export function flushOutbox(): void {
  if (!socket?.isReady()) return
  for (const entry of dueEntries(useOutboxStore.getState().entries)) sendEntry(entry)
}

function sendEntry(entry: OutboxEntry): void {
  // The envelope id IS the clientMsgId, on the first send and on every retry. A fresh id here
  // would duplicate the message on the server, permanently.
  const frame = makeFrame<MessageSendPayload>(
    'message.send',
    { dialog_id: entry.dialogId, text: entry.text },
    entry.clientMsgId,
  )
  if (socket?.send(frame)) useOutboxStore.getState().markAttempted(entry.clientMsgId)
}

// ─── Outbound actions ────────────────────────────────────────────────────────

export type SendResult = 'queued' | 'queue-full'

/**
 * Queue a message and try to send it now. It is queued first either way: with no REST fallback,
 * a disconnected client's only correct behaviour is to hold the message until a socket exists.
 */
export function sendChatMessage(dialogId: string, text: string): SendResult {
  const entry = useOutboxStore.getState().enqueue(dialogId, text)
  if (!entry) return 'queue-full'
  sendEntry(entry)
  return 'queued'
}

/**
 * One frame naming a position — never one per message. Opening a conversation with fifty unread
 * messages sends ONE `message.read` naming the newest.
 *
 * Nothing ever comes back: no ack, no error, not even for a dialog that is not yours. So the local
 * unread count is cleared optimistically, and a failure is simply not actionable.
 *
 * No client-side cursor comparison happens here. The server's cursor only moves forward (an
 * `ON CONFLICT ... WHERE` guard), so a stale or out-of-order frame is discarded for us — comparing
 * first would reimplement a guarantee we already have, against state that may be stale.
 */
export function sendRead(dialogId: string, upToMessageId: string): void {
  if (sentReads.get(dialogId) === upToMessageId) return
  sentReads.set(dialogId, upToMessageId)

  if (queryClient) setDialogUnread(queryClient, dialogId, 0)

  const frame = makeFrame<MessageReadOutPayload>('message.read', {
    dialog_id: dialogId,
    up_to_message_id: upToMessageId,
  })

  if (socket?.send(frame)) pendingReads.delete(dialogId)
  else pendingReads.set(dialogId, upToMessageId)
}

function resendReads(): void {
  for (const [dialogId, messageId] of pendingReads) {
    const frame = makeFrame<MessageReadOutPayload>('message.read', {
      dialog_id: dialogId,
      up_to_message_id: messageId,
    })
    if (socket?.send(frame)) pendingReads.delete(dialogId)
  }
}

/**
 * Presence is addressed by dialog and answered per person — you cannot name a user, by design.
 * The server resolves the dialog's membership, subtracts you, and subscribes THIS connection to
 * whoever is left, answering with an immediate `presence.update` per peer.
 *
 * Subscribe on open, unsubscribe on close. Never warm up the dialog list by subscribing to
 * everything: broadcasting presence to all contacts is what turns a carrier blip into a frame storm.
 */
export function subscribePresence(dialogId: string): void {
  const frame = makeFrame<DialogRefPayload>('presence.subscribe', { dialog_id: dialogId })
  if (socket?.send(frame)) usePresenceStore.getState().markSubscribed(dialogId)
}

/** Answers nothing, ever. It is an optimisation; closing the socket has the same effect. */
export function unsubscribePresence(dialogId: string): void {
  socket?.send(makeFrame<DialogRefPayload>('presence.unsubscribe', { dialog_id: dialogId }))
  usePresenceStore.getState().markUnsubscribed(dialogId)
}

/**
 * Leading edge: the first keystroke emits immediately, then at most one frame per 3s while typing.
 * Never one per keystroke — every emission costs the server a broker round trip, and this
 * client-side limit is the only thing standing between a chatty client and real load.
 *
 * Nothing comes back, ever, so there is nothing to handle and nothing to retry.
 */
export function sendTyping(dialogId: string): void {
  const now = Date.now()
  const last = lastTypingAt.get(dialogId) ?? 0
  if (now - last < TYPING_THROTTLE_MS) return

  lastTypingAt.set(dialogId, now)
  socket?.send(makeFrame<DialogRefPayload>('typing.start', { dialog_id: dialogId }))
}

/**
 * Send a call frame. Returns false when there is no socket, and the caller tears the call down:
 * nothing about a call is retryable — by the time a signal has failed, replaying it negotiates
 * against a peer that has moved on (docs/CALLS.md).
 *
 * The frame id is remembered against its call id, because an `error` frame correlates on `ref_id`
 * and `USER_BUSY` arrives that way — without this the caller would sit on "Calling…" forever with
 * the camera live.
 */
export function sendCallFrame<T>(type: OutboundFrameType, payload: T, callId: string): boolean {
  const frame = makeFrame<T>(type, payload)
  rememberCallFrame(frame.id, callId)
  return socket?.send(frame) ?? false
}

/** Bounded: ICE trickles in bursts, and an un-answered frame id is only interesting briefly. */
const MAX_TRACKED_CALL_FRAMES = 64
const callFrames = new Map<string, string>()

function rememberCallFrame(frameId: string, callId: string): void {
  callFrames.set(frameId, callId)
  while (callFrames.size > MAX_TRACKED_CALL_FRAMES) {
    const oldest = callFrames.keys().next()
    if (oldest.done) break
    callFrames.delete(oldest.value)
  }
}

/** The call a rejected frame belonged to, if it was one of ours. */
export function callIdForFrame(frameId: string): string | null {
  return callFrames.get(frameId) ?? null
}

/** Retry a FAILED message — same clientMsgId, so the server dedupes if it did land after all. */
export function retryChatMessage(clientMsgId: string): void {
  useOutboxStore.getState().retry(clientMsgId)
  flushOutbox()
}

export function discardChatMessage(clientMsgId: string): void {
  useOutboxStore.getState().remove(clientMsgId)
}
