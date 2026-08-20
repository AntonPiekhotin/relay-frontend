import { formatTime } from '@/lib/time'
import type { ChatMessage } from '@/lib/chat/message'
import { Button } from '@/components/Button'

export interface MessageRowProps {
  message: ChatMessage
  isMine: boolean
  /** Group conversations label who wrote each run of messages. */
  senderName?: string | undefined
  showSender?: boolean
  /** Derived from `message.read`: your message's createdAt is at or before somebody's read cursor. */
  isRead?: boolean
  /** "Seen by 3" in a group, from the read-state snapshot plus frames. Null where it does not apply. */
  seenBy?: string | null
  onRetry?: (() => void) | undefined
  onDiscard?: (() => void) | undefined
}

export function MessageRow({
  message,
  isMine,
  senderName,
  showSender = false,
  isRead = false,
  seenBy = null,
  onRetry,
  onDiscard,
}: MessageRowProps) {
  return (
    <li className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[min(36rem,80%)] rounded-2xl px-3 py-2 text-sm ${
          isMine ? 'bg-accent text-white' : 'bg-surface-raised text-zinc-100'
        } ${message.state === 'FAILED' ? 'ring-1 ring-red-500' : ''}`}
      >
        {showSender && senderName ? (
          <p className="mb-0.5 text-xs font-semibold text-zinc-300">{senderName}</p>
        ) : null}

        {/* Never rendered as HTML — React escapes, and nothing here reaches for innerHTML. */}
        <p className="whitespace-pre-wrap break-words">{message.text}</p>

        <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${isMine ? 'text-white/70' : 'text-zinc-500'}`}>
          <span>{formatTime(message.createdAt)}</span>
          {isMine ? <StateMark state={message.state} isRead={isRead} /> : null}
        </p>

        {seenBy ? <p className="text-right text-[11px] text-white/70">{seenBy}</p> : null}

        {message.state === 'FAILED' ? (
          <p className="mt-1 flex items-center gap-2 text-[11px] text-red-300">
            Not sent.
            {onRetry ? (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
            {onDiscard ? (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onDiscard}>
                Discard
              </Button>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  )
}

/**
 * PENDING is a clock, SENT is one tick, read is two. There is no "delivered" — an ack means
 * "durably persisted", and nothing in this protocol would ever tell us the recipient has it.
 */
function StateMark({ state, isRead }: { state: ChatMessage['state']; isRead: boolean }) {
  if (state === 'PENDING') return <span title="Queued">🕘</span>
  if (state === 'FAILED') return <span title="Not sent">!</span>
  return <span title={isRead ? 'Read' : 'Sent'}>{isRead ? '✓✓' : '✓'}</span>
}
