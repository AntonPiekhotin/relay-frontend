import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { formatDaySeparator, isSameDay } from '@/lib/time'
import { isSystemMessage } from '@/lib/chat/message'
import type { ChatMessage } from '@/lib/chat/message'
import { displayName, useUser } from '@/queries/useUser'
import { Spinner } from '@/components/Spinner'
import { EmptyState } from '@/components/EmptyState'
import { MessageRow } from './MessageRow'
import { SystemMessageRow } from './SystemMessageRow'
import { useT } from '@/lib/i18n'

export interface MessageListProps {
  messages: ChatMessage[]
  myId: string
  isGroup: boolean
  dialogTitle?: string | null
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  isRead?: ((message: ChatMessage) => boolean) | undefined
  /** Group seen-by, for the rows that should carry it. Returns null where it should not. */
  seenByLabel?: ((message: ChatMessage) => string | null) | undefined
  onRetry?: ((clientMsgId: string) => void) | undefined
  onDiscard?: ((clientMsgId: string) => void) | undefined
  /** Fired when the newest server-assigned message is actually on screen — the read trigger. */
  onNewestVisible?: ((messageId: string) => void) | undefined
}

/** Start paging this far from the top, so the next page is usually there before the user arrives. */
const LOAD_MORE_THRESHOLD_PX = 200
/** Anything closer than this to the bottom counts as "following the conversation". */
const STICK_THRESHOLD_PX = 80

export function MessageList({
  messages,
  myId,
  isGroup,
  dialogTitle,
  hasMore,
  isLoadingMore,
  onLoadMore,
  isRead,
  seenByLabel,
  onRetry,
  onDiscard,
  onNewestVisible,
}: MessageListProps) {
  const t = useT()
  const scroller = useRef<HTMLDivElement | null>(null)
  const bottomSentinel = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)
  /**
   * Scroll height captured just before a `before` page is requested, plus the row that was at the
   * top when it was captured. The key matters: without it, any other update that lands first — an
   * inbound `message.new` appending at the bottom — consumes the anchor, and the real prepend then
   * jumps the viewport by its full height.
   */
  const anchor = useRef<{ height: number; firstKey: string | null } | null>(null)
  const lastCount = useRef(0)
  const firstKeyRef = useRef<string | null>(null)
  const firstKey = messages[0]?.messageId ?? messages[0]?.clientMsgId ?? null

  const handleScroll = useCallback(() => {
    const node = scroller.current
    if (!node) return

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    stickToBottom.current = distanceFromBottom < STICK_THRESHOLD_PX

    if (node.scrollTop < LOAD_MORE_THRESHOLD_PX && hasMore && !isLoadingMore) {
      anchor.current = { height: node.scrollHeight, firstKey: firstKeyRef.current }
      onLoadMore()
    }
  }, [hasMore, isLoadingMore, onLoadMore])

  /**
   * Scroll anchoring. A chat grows at the bottom and pages at the top, so after prepending a page
   * the viewport must be pushed down by exactly the height that was added — otherwise reading old
   * messages yanks you somewhere else. And auto-scrolling somebody who has deliberately scrolled
   * up is the single most irritating bug a chat client can have, hence `stickToBottom`.
   */
  useLayoutEffect(() => {
    const node = scroller.current
    if (!node) return

    const grew = messages.length > lastCount.current
    lastCount.current = messages.length
    const previousFirstKey = firstKeyRef.current
    firstKeyRef.current = firstKey

    if (anchor.current) {
      if (anchor.current.firstKey !== firstKey && previousFirstKey === anchor.current.firstKey) {
        // The older page landed: push the viewport down by exactly what was added.
        node.scrollTop += node.scrollHeight - anchor.current.height
        anchor.current = null
        return
      }
      // The fetch settled without prepending — it failed, or there was nothing older. Drop the
      // anchor rather than leaving it to distort a later update.
      if (!isLoadingMore) anchor.current = null
    }

    if (grew && stickToBottom.current) node.scrollTop = node.scrollHeight
  }, [messages, firstKey, isLoadingMore])

  // The read trigger: one frame, sent when the newest message is genuinely visible — not on mount.
  const newestServerId = lastServerMessageId(messages)
  useEffect(() => {
    const node = bottomSentinel.current
    if (!node || !onNewestVisible || !newestServerId) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onNewestVisible(newestServerId)
      },
      { threshold: 0.9 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [newestServerId, onNewestVisible])

  if (messages.length === 0 && !isLoadingMore) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title={t.chat.emptyTitle} hint={t.chat.emptyHint} />
      </div>
    )
  }

  return (
    <div ref={scroller} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {isLoadingMore ? (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const newDay = !previous || !isSameDay(previous.createdAt, message.createdAt)
          const key = message.messageId ?? message.clientMsgId ?? String(index)

          return (
            <li key={key} className="list-none">
              {newDay ? (
                <p className="my-3 text-center text-xs font-medium text-fg-subtle">
                  {formatDaySeparator(message.createdAt)}
                </p>
              ) : null}
              <ul>
                {isSystemMessage(message) ? (
                  <SystemMessageRow message={message} dialogTitle={dialogTitle} />
                ) : (
                  <MessageRowWithSender
                    message={message}
                    isMine={message.senderId === myId}
                    showSender={isGroup && message.senderId !== myId && previous?.senderId !== message.senderId}
                    isRead={isRead?.(message) ?? false}
                    seenBy={seenByLabel?.(message) ?? null}
                    onRetry={message.clientMsgId && onRetry ? () => onRetry(message.clientMsgId as string) : undefined}
                    onDiscard={
                      message.clientMsgId && onDiscard ? () => onDiscard(message.clientMsgId as string) : undefined
                    }
                  />
                )}
              </ul>
            </li>
          )
        })}
      </ul>

      {/* aria-live sits on the tail, not the whole list — announcing every history page would be noise. */}
      <div ref={bottomSentinel} aria-live="polite" className="h-2" />
    </div>
  )
}

interface RowProps {
  message: ChatMessage
  isMine: boolean
  showSender: boolean
  isRead: boolean
  seenBy: string | null
  onRetry?: (() => void) | undefined
  onDiscard?: (() => void) | undefined
}

function MessageRowWithSender({ message, isMine, showSender, isRead, seenBy, onRetry, onDiscard }: RowProps) {
  const sender = useUser(showSender ? message.senderId : null)
  return (
    <MessageRow
      message={message}
      isMine={isMine}
      showSender={showSender}
      senderName={sender.data ? displayName(sender.data) : undefined}
      isRead={isRead}
      seenBy={seenBy}
      onRetry={onRetry}
      onDiscard={onDiscard}
    />
  )
}

function lastServerMessageId(messages: readonly ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const id = messages[i]?.messageId
    if (id) return id
  }
  return null
}
