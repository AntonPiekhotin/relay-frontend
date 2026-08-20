/**
 * One socket, one dispatcher, one switch on `type`.
 *
 * The `default` is protocol, not laziness: unknown frame types are ignored silently, which is what
 * lets the server ship a new frame type without breaking us (docs/REALTIME.md §4). The same
 * tolerance applies to `signal.verb`, system `kind`, presence `status`, and error `code`.
 *
 * Handlers never render. They update a Query cache entry or a store and return — which is what
 * makes this layer testable with no DOM.
 */

import type { QueryClient } from '@tanstack/react-query'
import { payloadOf } from '@/lib/protocol/codec'
import { RETRYABLE_ERROR_CODES } from '@/lib/protocol/types'
import type {
  AckPayload,
  DialogDeletedPayload,
  ErrorPayload,
  InboundEnvelope,
  MessageNewPayload,
  MessageReadInPayload,
  MessageSystemPayload,
  CallSignalPayload,
  PresenceUpdatePayload,
  SessionConnectedPayload,
  TypingStartInPayload,
} from '@/lib/protocol/types'
import { useOutboxStore } from '@/stores/outboxStore'
import { useSocketStore } from '@/stores/socketStore'
import { usePresenceStore } from '@/stores/presenceStore'
import { useTypingStore } from '@/stores/typingStore'
import { currentUserId, signOut } from '@/stores/authStore'
import { bumpDialog, dropDialog, insertHistoryMessages, setDialogUnread } from '@/queries/historyCache'
import { applyReadFrame } from '@/queries/useReadState'
import { qk } from '@/queries/keys'
import { USER_MESSAGE_KIND, fromMessageNew, fromMessageSystem } from '@/lib/chat/message'
import type { ChatMessage } from '@/lib/chat/message'
import type { DialogListResponse, DialogSummary } from '@/lib/api/types'
import { failDirectCall, handleDirectSignal } from '@/lib/calls/directCall'
import { activeGroupCallId, failGroupCall, handleGroupSignal } from '@/lib/calls/groupCall'
import { callIdForFrame } from './connection'
import { emitRelayEvent } from './events'

export interface DispatchContext {
  queryClient: QueryClient
  /** Run after `session.connected` — the six-step recovery lives in the connection module. */
  onSessionConnected?: (payload: SessionConnectedPayload) => void
}

export function dispatchFrame(frame: InboundEnvelope, ctx: DispatchContext): void {
  switch (frame.type) {
    case 'session.connected':
      handleSessionConnected(payloadOf<SessionConnectedPayload>(frame), ctx)
      break
    case 'ack':
      handleAck(payloadOf<AckPayload>(frame), ctx)
      break
    case 'message.new':
      handleMessageNew(payloadOf<MessageNewPayload>(frame), ctx)
      break
    case 'message.read':
      handleMessageRead(payloadOf<MessageReadInPayload>(frame), ctx)
      break
    case 'message.system':
      handleMessageSystem(payloadOf<MessageSystemPayload>(frame), ctx)
      break
    case 'presence.update':
      // An unrecognised status is offline, not an error — the store owns that tolerance.
      usePresenceStore.getState().apply(payloadOf<PresenceUpdatePayload>(frame))
      break
    case 'typing.start': {
      const typing = payloadOf<TypingStartInPayload>(frame)
      useTypingStore.getState().start(typing.dialog_id, typing.user_id)
      break
    }
    case 'call.signal':
      routeCallSignal(payloadOf<CallSignalPayload>(frame))
      break
    case 'dialog.deleted':
      handleDialogDeleted(payloadOf<DialogDeletedPayload>(frame), ctx)
      break
    case 'error':
      handleError(payloadOf<ErrorPayload>(frame))
      break
    case 'pong':
      // Consumed by the socket's heartbeat before it ever reaches here.
      break
    default:
      // MANDATORY. Unknown types are ignored, never errors.
      break
  }
}

/**
 * Direct and group calls share only this frame. The verb decides which mechanism owns it, and an
 * unknown verb falls through to the direct handler, which ignores it.
 */
function routeCallSignal(payload: CallSignalPayload): void {
  const verb = payload.signal.verb
  const isGroupVerb =
    verb.startsWith('group_') || verb.startsWith('participant_') || activeGroupCallId() === payload.call_id

  if (isGroupVerb) {
    handleGroupSignal(payload)
    return
  }
  void handleDirectSignal(payload)
}

function handleSessionConnected(payload: SessionConnectedPayload, ctx: DispatchContext): void {
  // The frame confirms which identity the server resolved from the token. If it is not who this
  // tab thinks it is, every cached dialog on screen belongs to somebody else — end the session
  // rather than merging two accounts' state.
  const expected = currentUserId()
  if (expected && payload.user_id !== expected) {
    emitRelayEvent('notice', { message: 'This session belongs to a different account. Sign in again.' })
    signOut()
    return
  }

  useSocketStore.getState().setSession(payload.session_id, payload.user_id)
  // Subscriptions belonged to the connection that just died. Nothing is remembered for us, so the
  // bookkeeping starts empty and step 6 of the recovery re-subscribes what is on screen.
  usePresenceStore.getState().clearSubscriptions()
  useTypingStore.getState().clear()
  ctx.onSessionConnected?.(payload)
}

/**
 * The ack is correlated on `client_msg_id` and carries the authoritative `created_at`, which may
 * differ from the optimistic local one and reorder the message. Removing the outbox entry and
 * inserting the real row happen together, or the message flickers out of the list and back in.
 */
function handleAck(payload: AckPayload, ctx: DispatchContext): void {
  const outbox = useOutboxStore.getState()
  const entry = outbox.entries[payload.client_msg_id]
  if (!entry) return

  const message: ChatMessage = {
    messageId: payload.message_id,
    clientMsgId: payload.client_msg_id,
    dialogId: entry.dialogId,
    senderId: currentUserId() ?? '',
    text: entry.text,
    createdAt: payload.created_at,
    kind: USER_MESSAGE_KIND,
    targetUserId: null,
    state: 'SENT',
  }

  insertHistoryMessages(ctx.queryClient, entry.dialogId, [message])
  // Your own message never raises your unread count.
  bumpDialog(ctx.queryClient, entry.dialogId, { lastMessageAt: payload.created_at, incrementUnread: false })
  outbox.remove(payload.client_msg_id)
}

/**
 * Delivered for other people's messages AND for your own sent from another device — the sending
 * connection gets an `ack` instead and is excluded by its `session_id`. Deduplicate on
 * `message_id`; receiving one you already hold is normal.
 */
function handleMessageNew(payload: MessageNewPayload, ctx: DispatchContext): void {
  const mine = payload.sender_id === currentUserId()

  // Their message has landed; waiting out the 5s typing timer now would look broken.
  useTypingStore.getState().stop(payload.dialog_id, payload.sender_id)

  insertHistoryMessages(ctx.queryClient, payload.dialog_id, [fromMessageNew(payload)])
  bumpDialog(ctx.queryClient, payload.dialog_id, {
    lastMessageAt: payload.created_at,
    incrementUnread: !mine,
  })
}

/**
 * Two branches, and clients routinely forget the second.
 *
 *  - Somebody else's cursor moved → draw read ticks on your own messages up to that position.
 *  - It is YOURS → another of your devices read this conversation, so clear the unread badge. The
 *    device that sent the read is excluded from the fan-out and must not wait for this.
 */
function handleMessageRead(payload: MessageReadInPayload, ctx: DispatchContext): void {
  if (payload.user_id === currentUserId()) {
    setDialogUnread(ctx.queryClient, payload.dialog_id, 0)
    return
  }

  applyReadFrame(ctx.queryClient, payload.dialog_id, {
    userId: payload.user_id,
    lastReadMessageId: payload.up_to_message_id,
    lastReadAt: payload.read_at,
  })
}

/**
 * A group changed shape, as a message. The same change is also a history row with the same
 * `message_id`, so it merges rather than duplicating, and it counts toward `unreadCount` like any
 * message (docs/MESSAGING.md §6).
 */
function handleMessageSystem(payload: MessageSystemPayload, ctx: DispatchContext): void {
  const myId = currentUserId()

  // If you are the target of a `member_removed`, you are out. The next dialog list will not
  // include it and fetching it now is a 404, so drop it locally right away.
  if (payload.kind === 'member_removed' && payload.target_user_id === myId) {
    dropDialog(ctx.queryClient, payload.dialog_id)
    emitRelayEvent('dialogGone', { dialogId: payload.dialog_id, reason: 'removed' })
    return
  }

  insertHistoryMessages(ctx.queryClient, payload.dialog_id, [fromMessageSystem(payload)])
  bumpDialog(ctx.queryClient, payload.dialog_id, {
    lastMessageAt: payload.created_at,
    incrementUnread: payload.actor_id !== myId,
  })

  // `title` is the dialog's CURRENT title — already the new one on a rename, so no refetch is
  // needed to draw it. Membership changes do need one: the frame does not carry the new list.
  if (payload.title !== null) updateDialogTitle(ctx, payload.dialog_id, payload.title)
  if (payload.kind === 'member_added' || payload.kind === 'member_removed' || payload.kind === 'member_left') {
    void ctx.queryClient.invalidateQueries({ queryKey: qk.dialog(payload.dialog_id) })
    void ctx.queryClient.invalidateQueries({ queryKey: qk.dialogs })
  }
}

function updateDialogTitle(ctx: DispatchContext, dialogId: string, title: string): void {
  ctx.queryClient.setQueryData<DialogSummary>(qk.dialog(dialogId), (old) => (old ? { ...old, title } : old))
  ctx.queryClient.setQueryData<{ pages: DialogListResponse[]; pageParams: unknown[] }>(qk.dialogs, (old) => {
    if (!old) return old
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        dialogs: page.dialogs.map((dialog) => (dialog.dialogId === dialogId ? { ...dialog, title } : dialog)),
      })),
    }
  })
}

/**
 * The owner deleted the group: dialog, membership AND messages are gone. There is no history left
 * to keep, and fetching it now yields a 404.
 */
function handleDialogDeleted(payload: DialogDeletedPayload, ctx: DispatchContext): void {
  dropDialog(ctx.queryClient, payload.dialog_id)
  emitRelayEvent('dialogGone', { dialogId: payload.dialog_id, reason: 'deleted' })
}

/**
 * `ref_id` echoes the offending frame's id, which for a `message.send` is the `clientMsgId` — so
 * one specific message fails rather than the whole conversation showing a banner.
 *
 * Retryable is a membership test against `RETRYABLE_ERROR_CODES`, never an enumeration of the
 * permanent ones: an unknown code must be treated as permanent, not retried forever.
 */
function handleError(payload: ErrorPayload): void {
  if (!payload.ref_id) {
    // Raised before the envelope id could be read. It cannot be attributed to any one message.
    emitRelayEvent('notice', { message: 'The server rejected a request.' })
    return
  }

  // A call frame, not a send: `USER_BUSY` on an invite arrives exactly like this, and dropping it
  // leaves the caller ringing forever with the camera on.
  const callId = callIdForFrame(payload.ref_id)
  if (callId) {
    if (activeGroupCallId() === callId) failGroupCall(callId)
    else failDirectCall(callId, payload.code)
    return
  }

  const outbox = useOutboxStore.getState()
  const entry = outbox.entries[payload.ref_id]
  if (!entry) return

  if (RETRYABLE_ERROR_CODES.has(payload.code)) {
    // Nothing to do: the send path already recorded the attempt and scheduled the next one, and
    // that retry carries the SAME id — which is what makes it idempotent server-side.
    return
  }

  outbox.markFailed(payload.ref_id, payload.code)
}
