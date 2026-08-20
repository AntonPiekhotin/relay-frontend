import { useOutboxStore } from '@/stores/outboxStore'
import { useSocketStore } from '@/stores/socketStore'

/**
 * Not optional. With no REST fallback send, a disconnected client's messages sit in the outbox
 * indefinitely — and a UI that looks normal while that happens is lying to the user (docs/UI.md §4).
 */
export function ConnectionBanner() {
  const status = useSocketStore((s) => s.status)
  const queued = useOutboxStore((s) => Object.keys(s.entries).length)

  if (status === 'ready') return null

  const text =
    status === 'unauthorized'
      ? 'Your session ended. Sign in again to keep chatting.'
      : status === 'connecting' || status === 'authenticating'
        ? 'Connecting…'
        : 'Offline. Messages you write will send when the connection returns.'

  return (
    <div
      role="status"
      className={`px-4 py-1.5 text-center text-xs ${
        status === 'unauthorized' ? 'bg-red-900/60 text-red-100' : 'bg-surface-raised text-zinc-300'
      }`}
    >
      {text}
      {queued > 0 ? ` ${queued} message${queued === 1 ? '' : 's'} waiting.` : ''}
    </div>
  )
}
