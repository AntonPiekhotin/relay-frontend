import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { useDialog } from '@/queries/useDialogs'
import { useHistory } from '@/queries/useHistory'
import { isReadByAnyone, seenByCount, useReadState } from '@/queries/useReadState'
import { entriesForDialog, useOutboxStore } from '@/stores/outboxStore'
import {
  discardChatMessage,
  retryChatMessage,
  sendChatMessage,
  sendRead,
  sendTyping,
  setOpenDialog,
  subscribePresence,
  unsubscribePresence,
} from '@/lib/realtime/connection'
import { useDialogGone } from '@/hooks/useDialogGone'
import { fromOutboxEntry, mergeMessages } from '@/lib/chat/message'
import type { ChatMessage } from '@/lib/chat/message'
import { useDialogDisplay } from '@/features/dialogs/useDialogDisplay'
import { Avatar } from '@/components/Avatar'
import { ErrorState } from '@/components/ErrorState'
import { SkeletonRows } from '@/components/SkeletonRows'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { startDirectCall } from '@/lib/calls/directCall'
import { startGroupCall } from '@/lib/calls/groupCall'
import { Button } from '@/components/Button'
import { PresenceLine } from './PresenceLine'
import { TypingRow } from './TypingRow'

export function ChatPane() {
  const { dialogId } = useParams<{ dialogId: string }>()
  const myId = useAuthStore((s) => s.userId) ?? ''
  const dialog = useDialog(dialogId)
  const history = useHistory(dialogId)
  const display = useDialogDisplay(dialog.data)
  const readState = useReadState(dialogId)
  const [queueFull, setQueueFull] = useState(false)

  useDialogGone(dialogId)

  // Which conversation is open drives reconnect priority and presence subscriptions.
  useEffect(() => {
    setOpenDialog(dialogId ?? null)
    return () => setOpenDialog(null)
  }, [dialogId])

  /**
   * Subscribe on open, unsubscribe on close — the contract, not a suggestion. Never subscribe for
   * conversations that are not on screen, and expect nothing for them either. If the socket is not
   * ready yet, step 6 of the reconnect sequence subscribes this dialog as soon as it is.
   */
  useEffect(() => {
    if (!dialogId) return
    subscribePresence(dialogId)
    return () => unsubscribePresence(dialogId)
  }, [dialogId])

  // Select narrowly: the whole outbox would re-render this pane on any dialog's send.
  const outboxEntries = useOutboxStore((s) => s.entries)
  const pending = useMemo(
    () => (dialogId ? entriesForDialog(outboxEntries, dialogId).map((entry) => fromOutboxEntry(entry, myId)) : []),
    [outboxEntries, dialogId, myId],
  )

  /**
   * Server rows come from the Query cache; unacked ones from the outbox. The merge collapses them
   * into one row per message — an optimistic row and its history row must never both appear.
   */
  const messages = useMemo(() => mergeMessages(history.data ?? [], pending), [history.data, pending])

  // Stable identities: both are effect dependencies inside the list (the read observer, in
  // particular, would be torn down and rebuilt on every render otherwise).
  const readEntries = useMemo(() => readState.data?.entries ?? [], [readState.data])
  const isRead = useCallback(
    (message: ChatMessage) => isReadByAnyone(readEntries, message, myId),
    [readEntries, myId],
  )

  const isGroup = dialog.data?.type === 'group'
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message?.senderId === myId && message.messageId) return message.messageId
    }
    return null
  }, [messages, myId])

  /** Only the newest of your own messages carries a seen-by line; one per row would be noise. */
  const seenByLabel = useCallback(
    (message: ChatMessage) => {
      if (!isGroup || message.messageId === null || message.messageId !== lastMineId) return null
      const count = seenByCount(readEntries, message, myId)
      return count > 0 ? `Seen by ${count}` : null
    },
    [isGroup, lastMineId, readEntries, myId],
  )

  /**
   * A group dialog and a group call are not linked in the backend: the call endpoint takes an
   * ad-hoc invitee list, so "call this group" means passing the dialog's other participants
   * (docs/CALLS.md §2). A direct call goes over the socket instead, with its own mechanism.
   */
  const startCall = useCallback(
    async (media: 'audio' | 'video') => {
      if (!dialog.data) return
      if (dialog.data.type === 'group') {
        await startGroupCall(
          dialog.data.participantIds.filter((id) => id !== myId),
          media,
        )
        return
      }
      const peerId = dialog.data.participantIds.find((id) => id !== myId)
      if (peerId) await startDirectCall(peerId, media, dialog.data.dialogId)
    },
    [dialog.data, myId],
  )

  const canCall = Boolean(dialog.data)

  const handleNewestVisible = useCallback(
    (messageId: string) => {
      if (dialogId) sendRead(dialogId, messageId)
    },
    [dialogId],
  )

  if (!dialogId) return null

  if (dialog.isError) {
    // A 404 here means "gone" OR "not yours" — deliberately indistinguishable, so say neither.
    return (
      <ErrorState
        error={dialog.error}
        what="This conversation is no longer available."
        onRetry={() => void dialog.refetch()}
      />
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border-subtle p-2 sm:gap-3 sm:p-3">
        <Avatar
          avatarUrl={display.avatarUrl}
          userId={display.peerId ?? dialogId}
          initials={display.initials}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{display.name || '…'}</p>
          <PresenceLine peerId={display.peerId} />
        </div>
        {isGroup ? (
          <Link
            to={`/d/${dialogId}/info`}
            className="shrink-0 whitespace-nowrap text-sm text-accent hover:underline"
          >
            {dialog.data?.participantIds.length}
            <span className="hidden sm:inline"> members</span>
          </Link>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 sm:px-3"
          aria-label="Start a voice call"
          disabled={!canCall}
          onClick={() => void startCall('audio')}
        >
          Call
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 sm:px-3"
          aria-label="Start a video call"
          disabled={!canCall}
          onClick={() => void startCall('video')}
        >
          Video
        </Button>
      </header>

      {history.isPending ? (
        <div className="flex-1">
          <SkeletonRows count={4} />
        </div>
      ) : history.isError ? (
        <ErrorState error={history.error} what="Could not load messages." onRetry={() => void history.refetch()} />
      ) : (
        <MessageList
          key={dialogId}
          messages={messages}
          myId={myId}
          isGroup={isGroup}
          dialogTitle={dialog.data?.title ?? null}
          hasMore={history.hasNextPage}
          isLoadingMore={history.isFetchingNextPage}
          onLoadMore={() => void history.fetchNextPage()}
          isRead={isRead}
          seenByLabel={seenByLabel}
          onRetry={retryChatMessage}
          onDiscard={discardChatMessage}
          onNewestVisible={handleNewestVisible}
        />
      )}

      {queueFull ? (
        <p role="alert" className="px-4 pb-1 text-xs text-red-400">
          Too many messages are waiting to send here. Wait for the connection to come back.
        </p>
      ) : null}

      <TypingRow dialogId={dialogId} />

      <Composer
        dialogId={dialogId}
        onTyping={() => sendTyping(dialogId)}
        onSend={(text) => {
          const accepted = sendChatMessage(dialogId, text) === 'queued'
          setQueueFull(!accepted)
          return accepted
        }}
      />
    </div>
  )
}
