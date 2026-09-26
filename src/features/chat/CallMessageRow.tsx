import { Icon } from '@/components/Icon'
import { formatTime } from '@/lib/time'
import { isUnreadCall } from '@/lib/chat/message'
import type { ChatMessage } from '@/lib/chat/message'
import { useT, type Messages } from '@/lib/i18n'

export interface CallMessageRowProps {
  message: ChatMessage
  /** You placed the call. The row's `senderId` is always the caller. */
  isMine: boolean
}

/**
 * A direct call, as a bubble on the caller's side of the chat. Structured on the wire, so the
 * sentence is composed here; an unknown `outcome` falls back to a plain "call", never a throw.
 *
 * A call you never picked up is drawn in the danger colour — the same rows the server counts as
 * unread (`isUnreadCall`), so the badge and the bubble always agree.
 */
export function CallMessageRow({ message, isMine }: CallMessageRowProps) {
  const t = useT()
  const call = message.call
  if (!call) return null

  const missed = !isMine && isUnreadCall(message.senderId, call.outcome, null)
  const duration = call.outcome === 'completed' && call.durationSeconds !== null ? formatCallDuration(call.durationSeconds) : null

  return (
    <li className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm ${
          isMine ? 'bg-accent text-white' : 'bg-surface-raised text-fg'
        }`}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            missed ? 'bg-danger-surface text-danger' : isMine ? 'bg-white/20' : 'bg-surface-subtle'
          }`}
        >
          <Icon name={call.media === 'video' ? 'video' : 'phone'} className="size-4" />
        </span>
        <span className="min-w-0">
          <span className={`block font-medium ${missed ? 'text-danger' : ''}`}>
            {labelFor(t, call.outcome, call.media, isMine)}
          </span>
          <span className={`block text-[11px] ${isMine ? 'text-white/70' : 'text-fg-subtle'}`}>
            {formatTime(message.createdAt)}
            {duration ? ` · ${duration}` : ''}
          </span>
        </span>
      </div>
    </li>
  )
}

function labelFor(t: Messages, outcome: string, media: string, isMine: boolean): string {
  const video = media === 'video'
  switch (outcome) {
    case 'completed':
      return isMine ? t.chat.callOutgoing(video) : t.chat.callIncoming(video)
    case 'missed':
    case 'canceled':
      // Rang out or given up on by the caller: to the callee both are a call they missed.
      return isMine ? (outcome === 'missed' ? t.chat.callNoAnswer(video) : t.chat.callCanceled(video)) : t.chat.callMissed(video)
    case 'declined':
      return t.chat.callDeclined(video)
    default:
      return video ? t.calls.videoCall : t.calls.voiceCall
  }
}

function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}
